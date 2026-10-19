import { BackupError } from './backupConfig.js';
import { validateRestoreBackup } from './databaseRestores.js';
import { recordRestoreEvent } from './restoreControl.js';
import { writeAuditLog } from '../utils/audit.js';

const failureCode = error => error instanceof BackupError && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : 'RESTORE_WORKER_FAILED';

export const createRestoreWorker = ({ db, runtime, backupRuntime, safetyService, audit = writeAuditLog }) => {
  const event = async (id, action) => {
    await recordRestoreEvent(db, id, action);
    await audit(db, { action, entityType: 'database_restore', entityId: id });
  };
  const phase = (id, status, value) => db.query('UPDATE recovery_control.database_restore_jobs SET status=$2, phase=$3 WHERE id=$1', [id, status, value]);
  const fail = async (id, code) => {
    const result = await db.query(`UPDATE recovery_control.database_restore_jobs SET status='failed', failure_code=$2, completed_at=NOW()
      WHERE id=$1 AND status IN ('queued','preparing','restoring','validating') RETURNING *`, [id, code]);
    const job = result.rows[0];
    if (!job) return;
    await recordRestoreEvent(db, id, 'DATABASE_RESTORE_FAILED');
    await audit(db, { action: 'DATABASE_RESTORE_FAILED', entityType: 'database_restore', entityId: id, metadata: { failure_code: code } }).catch(() => {});
    if (!job.destructive_started) await db.query('UPDATE recovery_control.state SET maintenance=false, updated_at=NOW() WHERE id=1 AND restore_job_id=$1', [id]);
  };
  const preserveBackup = async record => {
    // No creator FK: an older snapshot may not contain the requesting account.
    await db.query(`INSERT INTO backup_records (id,storage_key,filename,backup_type,status,daily_key,created_by,created_at,started_at,completed_at,size_bytes,checksum,encrypted)
      VALUES ($1,$2,$3,$4,'completed',$5,NULL,$6,$7,$8,$9,$10,true) ON CONFLICT (id) DO UPDATE SET
        storage_key=EXCLUDED.storage_key, filename=EXCLUDED.filename, backup_type=EXCLUDED.backup_type,
        status='completed', daily_key=EXCLUDED.daily_key, created_by=NULL, created_at=EXCLUDED.created_at,
        started_at=EXCLUDED.started_at, completed_at=EXCLUDED.completed_at, size_bytes=EXCLUDED.size_bytes,
        checksum=EXCLUDED.checksum, encrypted=true, deleted_at=NULL, error_summary=NULL`,
    [record.id, record.storage_key, record.filename, record.backup_type, record.daily_key, record.created_at, record.started_at, record.completed_at, record.size_bytes, record.checksum]);
  };
  return {
    fail,
    async run(id, backupId) {
      let lock;
      let claimed = false;
      try {
        const claim = await db.query(`UPDATE recovery_control.database_restore_jobs j SET status='preparing', phase='safety_backup', started_at=NOW()
          WHERE j.id=$1 AND j.backup_id=$2 AND j.status='queued' AND j.requested_at > NOW()-INTERVAL '15 minutes'
          AND EXISTS (SELECT 1 FROM users u WHERE u.id=j.requested_by AND u.role='super_admin' AND u.is_active=true AND COALESCE(u.is_deleted,false)=false)
          RETURNING j.*`, [id, backupId]);
        const job = claim.rows[0];
        if (!job) throw new BackupError('RESTORE_JOB_INVALID', 'No fresh authorized recovery request exists.');
        claimed = true;
        lock = await backupRuntime.lock();
        if (!lock) throw new BackupError('BACKUP_BUSY', 'A database backup is already running.');
        const selected = validateRestoreBackup((await db.query('SELECT * FROM backup_records WHERE id=$1', [backupId])).rows[0]);
        if (selected.checksum !== job.selected_metadata.checksum || selected.storage_key !== job.selected_metadata.storage_key) throw new BackupError('RESTORE_RECORD_CHANGED', 'The selected backup record changed.');
        await backupRuntime.assertObject(selected);
        const protectedState = await db.query('UPDATE recovery_control.state SET maintenance=true, restore_job_id=$1, updated_at=NOW() WHERE id=1', [id]);
        if (protectedState.rowCount !== 1) throw new BackupError('RESTORE_CONTROL', 'Recovery maintenance could not be enabled.');
        await runtime.drain();
        // Borrow the global backup lease: the existing backup service owns all
        // generation/encryption/upload logic, while this worker retains the lock.
        const service = safetyService(id, { ...backupRuntime, lock: async () => ({ ...lock, release: async () => {} }) });
        const requested = await service.request({ type: 'manual', actor: job.requested_by });
        const result = await requested.completion;
        if (result.status !== 'completed') throw new BackupError('RESTORE_SAFETY_BACKUP', 'The mandatory safety backup failed.');
        const safety = validateRestoreBackup((await db.query('SELECT * FROM backup_records WHERE id=$1', [result.id])).rows[0]);
        await backupRuntime.assertObject(safety);
        await db.query('UPDATE recovery_control.database_restore_jobs SET safety_backup_id=$2, safety_metadata=$3::jsonb WHERE id=$1', [id, safety.id, JSON.stringify(safety)]);
        await event(id, 'DATABASE_PRE_RESTORE_BACKUP_CREATED');
        await phase(id, 'preparing', 'downloading');
        const encrypted = await runtime.download(selected);
        await phase(id, 'preparing', 'verifying');
        if ((await runtime.checksum(encrypted)).toLowerCase() !== selected.checksum.toLowerCase()) throw new BackupError('RESTORE_CHECKSUM', 'Backup checksum verification failed.');
        let dump;
        try { dump = await runtime.decrypt(encrypted); }
        catch { throw new BackupError('RESTORE_AUTHENTICATION', 'Encrypted backup authentication failed.'); }
        await runtime.inspect(dump);
        await lock.assertHeld();
        await runtime.assertHeld();
        // From this point failure must retain maintenance, even if the client
        // process stops before PostgreSQL reports whether its transaction committed.
        await event(id, 'DATABASE_RESTORE_STARTED');
        const ready = await db.query("UPDATE recovery_control.database_restore_jobs SET status='restoring', phase='restoring', destructive_started=true WHERE id=$1 AND safety_backup_id IS NOT NULL AND status='preparing' RETURNING id", [id]);
        if (ready.rowCount !== 1) throw new BackupError('RESTORE_SAFETY_BACKUP', 'The mandatory safety backup was not recorded.');
        await runtime.restore(dump);
        await phase(id, 'validating', 'migrating');
        await runtime.migrate();
        await phase(id, 'validating', 'validating');
        await runtime.validate(db);
        await preserveBackup(selected);
        await preserveBackup(safety);
        // Replay durable audit milestones after public audit tables are rewound.
        const durable = (await db.query('SELECT * FROM recovery_control.database_restore_jobs WHERE id=$1', [id])).rows[0];
        for (const entry of durable.events) await audit(db, { action: entry.action, entityType: 'database_restore', entityId: id, metadata: { originally_recorded_at: entry.at, backup_id: backupId, safety_backup_id: safety.id, requested_by: job.requested_by } });
        await db.query('DELETE FROM http_sessions');
        await db.query('UPDATE sessions SET is_active=false WHERE is_active=true');
        await event(id, 'DATABASE_RESTORE_COMPLETED');
        const finished = await db.query(`WITH finished AS (UPDATE recovery_control.database_restore_jobs SET status='completed', phase='completed', completed_at=NOW()
          WHERE id=$1 AND EXISTS (SELECT 1 FROM recovery_control.state WHERE id=1 AND restore_job_id=$1 AND maintenance=true) RETURNING id)
          UPDATE recovery_control.state SET maintenance=false, updated_at=NOW() WHERE id=1 AND restore_job_id IN (SELECT id FROM finished)`, [id]);
        if (finished.rowCount !== 1) throw new BackupError('RESTORE_CONTROL', 'Recovery maintenance could not be released.');
        return { status: 'completed', id };
      } catch (error) {
        if (claimed) await fail(id, failureCode(error));
        throw new BackupError(failureCode(error), 'Database restoration stopped. Check the recovery job status.');
      } finally {
        await runtime.cleanup().catch(() => {});
        await lock?.release().catch(() => {});
      }
    },
  };
};
