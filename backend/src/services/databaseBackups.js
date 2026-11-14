import { randomUUID } from 'node:crypto';
import { BackupError, scheduleWindow } from './backupConfig.js';
import { writeAuditLog } from '../utils/audit.js';
import { assertNoRestore } from './restoreControl.js';

export const publicBackup = row => row && ({
  id: row.id, filename: row.filename, backup_type: row.backup_type, status: row.status,
  created_at: row.created_at, started_at: row.started_at, completed_at: row.completed_at,
  deleted_at: row.deleted_at, created_by_name: row.created_by_name || (row.backup_type === 'automatic' ? 'System' : 'Super Admin'),
  size_bytes: row.size_bytes == null ? null : Number(row.size_bytes), checksum: row.checksum,
  encrypted: row.encrypted, error_summary: row.error_summary,
  source: row.source || 'system', recovery_expires_at: row.recovery_expires_at || null,
});
const safeFailure = error => error instanceof BackupError ? error.message : 'Backup failed. Check system logs.';

export const createBackupService = ({ db, runtime, config, now = () => new Date(), audit = writeAuditLog, restoreJobId = null }) => {
  const log = (action, record, actor = null, req = null, metadata = {}) => audit(db, {
    req, actorUserId: actor, action, entityType: 'backup', entityId: record.id,
    metadata: { backup_type: record.backup_type, ...metadata },
  });
  const get = async id => {
    const result = await db.query('SELECT * FROM backup_records WHERE id = $1', [id]);
    if (!result.rows[0]) throw new BackupError('BACKUP_NOT_FOUND', 'Backup not found.', 404);
    return result.rows[0];
  };
  const removeRecord = async (record, actor, req, reason) => {
    const protectedBackup = await db.query(`SELECT id FROM recovery_control.database_restore_jobs WHERE
      (status IN ('queued','preparing','restoring','validating') OR
       (destructive_started AND status='failed' AND EXISTS (SELECT 1 FROM recovery_control.state WHERE maintenance)))
      AND (backup_id=$1 OR safety_backup_id=$1) LIMIT 1`, [record.id]);
    if (protectedBackup.rows.length) throw new BackupError('RESTORE_BUSY', 'This backup is protected by database recovery.', 409);
    if (record.deleted_at) return;
    if (record.status === 'queued' || record.status === 'running') throw new BackupError('BACKUP_BUSY', 'Backup already in progress.', 409);
    const newest = await db.query("SELECT id FROM backup_records WHERE status = 'completed' AND deleted_at IS NULL AND (source='system' OR recovery_expires_at IS NULL) ORDER BY created_at DESC, id DESC LIMIT 1");
    if (newest.rows[0]?.id === record.id) throw new BackupError('BACKUP_NEWEST', 'Keep the newest successful backup.', 409);
    // Write the deletion intent before touching storage; failures remain traceable.
    await log('BACKUP_DELETE_REQUESTED', record, actor, req, { reason });
    await runtime.remove(record);
    await db.query('UPDATE backup_records SET deleted_at = NOW() WHERE id = $1', [record.id]);
    await log('BACKUP_DELETED', record, actor, req, { reason });
  };
  const retention = async () => {
    const cutoff = new Date(now().getTime() - config.retentionDays * 86400000);
    const expired = await db.query(`SELECT * FROM backup_records WHERE (created_at < $1
      OR (source='uploaded_recovery' AND recovery_expires_at <= NOW()))
      AND deleted_at IS NULL AND status IN ('completed','failed') ORDER BY created_at`, [cutoff]);
    for (const record of expired.rows) {
      try { await removeRecord(record, null, null, 'retention'); }
      catch (error) { if (error.code !== 'BACKUP_NEWEST') throw error; }
    }
  };
  const execute = async (record, lock, actor, req) => {
    let artifact;
    let uploadAttempted = false;
    const timeout = AbortSignal.timeout(30 * 60 * 1000);
    const signal = AbortSignal.any([lock.signal, timeout]);
    try {
      await db.query("UPDATE backup_records SET status = 'running', started_at = NOW() WHERE id = $1", [record.id]);
      await runtime.ready();
      artifact = await runtime.prepare(record, signal);
      if (!artifact.size || !/^[a-f\d]{64}$/.test(artifact.checksum)) throw new BackupError('BACKUP_EMPTY', 'Backup generation produced no valid encrypted artifact.');
      uploadAttempted = true;
      await runtime.upload(record, artifact, signal);
      signal.throwIfAborted();
      await lock.assertHeld();
      // Audit precedes success. A failure cannot be reported as a completed backup.
      await log('BACKUP_CREATED', record, actor, req, { size_bytes: artifact.size, checksum: artifact.checksum, encrypted: true });
      await db.query("UPDATE backup_records SET status = 'completed', completed_at = NOW(), size_bytes = $2, checksum = $3, error_summary = NULL WHERE id = $1", [record.id, artifact.size, artifact.checksum]);
      // A retention failure does not invalidate the newly completed, durable backup.
      try { await retention(); } catch { await log('BACKUP_RETENTION_FAILED', record).catch(() => {}); }
      return { status: 'completed', id: record.id };
    } catch (error) {
      console.error('BACKUP_FAILED', { backup_id: record.id, code: error instanceof BackupError ? error.code : 'BACKUP_RUNTIME_ERROR' });
      if (uploadAttempted) await runtime.remove(record).catch(() => {});
      const message = safeFailure(error);
      await db.query("UPDATE backup_records SET status = 'failed', completed_at = NOW(), error_summary = $2 WHERE id = $1", [record.id, message]);
      await log('BACKUP_FAILED', record, actor, req, { reason: message }).catch(() => {});
      return { status: 'failed', id: record.id };
    } finally {
      await artifact?.cleanup().catch(() => {});
      await lock.release();
    }
  };
  return {
    async list() {
      const result = await db.query(`SELECT b.*, u.name AS created_by_name FROM backup_records b LEFT JOIN users u ON u.id = b.created_by ORDER BY b.created_at DESC LIMIT 100`);
      return result.rows.map(publicBackup);
    },
    async status() {
      let readinessError = null;
      try { await runtime.ready(); } catch (error) { readinessError = safeFailure(error); }
      const currentTime = now();
      const schedule = config.enabled ? scheduleWindow(config, currentTime) : null;
      const result = await db.query(`SELECT
        (SELECT row_to_json(b) FROM backup_records b WHERE status='completed' AND deleted_at IS NULL AND (b.source='system' OR b.recovery_expires_at IS NULL) ORDER BY created_at DESC LIMIT 1) AS last_success,
        (SELECT row_to_json(b) FROM backup_records b WHERE status='failed' AND (b.source='system' OR b.recovery_expires_at IS NULL) ORDER BY created_at DESC LIMIT 1) AS last_failure,
        (SELECT row_to_json(b) FROM backup_records b WHERE status IN ('queued','running') ORDER BY created_at DESC LIMIT 1) AS active,
        (SELECT last_checked_at FROM backup_scheduler WHERE id=1) AS scheduler_last_checked_at,
        EXISTS (SELECT 1 FROM backup_records b WHERE b.backup_type = 'automatic' AND b.daily_key = $1
          AND b.status = 'completed' AND b.deleted_at IS NULL) AS due_completed,
        EXISTS (SELECT 1 FROM backup_records b WHERE b.backup_type = 'automatic' AND b.daily_key = $1
          AND b.status = 'failed') AS due_failed`, [schedule?.dailyKey || null]);
      const row = result.rows[0] || {};
      const heartbeat = row.scheduler_last_checked_at;
      // The external job runs once daily, around 15 minutes after the due time.
      // A completed due day stays healthy; a fresh heartbeat cannot hide a
      // missing backup after the 90-minute grace period.
      const schedulerStatus = !config.enabled ? 'disabled'
        : !heartbeat ? 'not_observed'
          : row.due_completed ? 'healthy'
            : row.due_failed ? 'failed'
              : currentTime.getTime() >= new Date(schedule.due).getTime() + 90 * 60000 ? 'overdue' : 'healthy';
      return {
        configured: !readinessError, readiness_error: readinessError,
        automatic_enabled: config.enabled, cron: config.cron, timezone: config.timezone,
        next_automatic_backup: schedule?.next || null,
        scheduler_last_checked_at: heartbeat || null,
        scheduler_status: schedulerStatus,
        retention_days: config.retentionDays, storage: readinessError ? 'unavailable' : 'private', encrypted: true,
        last_success: publicBackup(row.last_success), last_failure: publicBackup(row.last_failure), active: publicBackup(row.active),
      };
    },
    async request({ type = 'manual', actor = null, req = null, dailyKey = null } = {}) {
      if (!['manual', 'automatic'].includes(type)) throw new BackupError('BACKUP_TYPE', 'Invalid backup type.', 400);
      const lock = await runtime.lock();
      if (!lock) throw new BackupError('BACKUP_BUSY', 'Backup already in progress.', 409);
      let handedOff = false;
      try {
        await assertNoRestore(db, restoreJobId);
        // With the global session lock acquired, any old active record lost its worker.
        const interrupted = await db.query("UPDATE backup_records SET status = 'failed', completed_at = NOW(), error_summary = 'Backup worker was interrupted. Retry the backup.' WHERE status IN ('queued','running') RETURNING *");
        for (const record of interrupted.rows) await log('BACKUP_FAILED', record, null, null, { reason: 'worker_interrupted' });
        if (dailyKey) {
          const existing = await db.query("SELECT * FROM backup_records WHERE daily_key = $1 AND status = 'completed' LIMIT 1", [dailyKey]);
          if (existing.rowCount) return { skipped: true, backup: publicBackup(existing.rows[0]), completion: Promise.resolve({ status: 'completed' }) };
        }
        const id = randomUUID();
        const filename = `10thwest-${now().toISOString().replace(/[:.]/g, '-')}-${id}.dump.enc`;
        const result = await db.query(`INSERT INTO backup_records (id, storage_key, filename, backup_type, status, daily_key, created_by)
          VALUES ($1,$2,$3,$4,'queued',$5,$6) RETURNING *`, [id, `database/${id}/${filename}`, filename, type, dailyKey, actor]);
        const record = result.rows[0];
        // Defer work until after the HTTP handler can send 202. The CLI awaits this same promise.
        const completion = new Promise(resolve => setImmediate(resolve)).then(() => execute(record, lock, actor, req));
        handedOff = true;
        return { backup: publicBackup(record), completion };
      } finally { if (!handedOff) await lock.release(); }
    },
    async download(id, actor, req) {
      const record = await get(id);
      if (record.status !== 'completed' || record.deleted_at || !record.encrypted) throw new BackupError('BACKUP_NOT_READY', 'A completed, encrypted backup is required.', 409);
      await log('BACKUP_DOWNLOADED', record, actor, req);
      return { url: await runtime.download(record), filename: record.filename, expires_in: 60, encrypted: true };
    },
    async delete(id, actor, req) {
      const lock = await runtime.lock();
      if (!lock) throw new BackupError('BACKUP_BUSY', 'Backup already in progress.', 409);
      try { await assertNoRestore(db); await removeRecord(await get(id), actor, req, 'manual'); }
      finally { await lock.release(); }
    },
  };
};
