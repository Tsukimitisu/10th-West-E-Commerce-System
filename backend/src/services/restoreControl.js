import { BackupError } from './backupConfig.js';
import { writeAuditLog } from '../utils/audit.js';

export const RESTORE_WRITE_LOCK = 108701802;
export const restoreUnavailable = () => new BackupError('SYSTEM_RESTORE_IN_PROGRESS', 'The system is temporarily unavailable while database recovery is in progress.', 503);
export const expireUnclaimedRestores = async db => {
  const expired = await db.query(`UPDATE recovery_control.database_restore_jobs
    SET status='failed', failure_code='RESTORE_WORKER_NOT_STARTED', completed_at=NOW(),
      events=events || jsonb_build_array(jsonb_build_object('action','DATABASE_RESTORE_FAILED','at',NOW()))
    WHERE status='queued' AND requested_at < NOW()-INTERVAL '15 minutes' RETURNING id`);
  for (const job of expired.rows) await writeAuditLog(db, { action: 'DATABASE_RESTORE_FAILED', entityType: 'database_restore', entityId: job.id, metadata: { failure_code: 'RESTORE_WORKER_NOT_STARTED' } }).catch(() => {});
};
export const assertNoRestore = async (db, allowedJob = null) => {
  await expireUnclaimedRestores(db);
  const result = await db.query(`SELECT j.id FROM recovery_control.database_restore_jobs j
    WHERE j.status IN ('queued','preparing','restoring','validating')
      OR (j.destructive_started AND j.status='failed' AND EXISTS (SELECT 1 FROM recovery_control.state WHERE maintenance)) LIMIT 1`);
  if (result.rows[0] && result.rows[0].id !== allowedJob) throw new BackupError('RESTORE_BUSY', 'Database recovery is in progress.', 409);
};

export const safeRestoreJob = row => row && ({
  id: row.id, backup_id: row.backup_id, status: row.status, phase: row.phase,
  requested_at: row.requested_at, started_at: row.started_at, completed_at: row.completed_at,
  failure_code: row.failure_code, destructive_started: Boolean(row.destructive_started),
  restored_from: row.selected_metadata?.created_at,
  backup_source: row.selected_metadata?.source || 'system', backup_filename: row.selected_metadata?.filename,
  github_run_url: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(row.github_run_url || '') ? row.github_run_url : null,
});

export const recordRestoreEvent = async (db, id, action) => {
  // Durable audit, independent of public.audit_logs which an older dump can rewind.
  await db.query(`UPDATE recovery_control.database_restore_jobs
    SET events = events || $2::jsonb WHERE id=$1`, [id, JSON.stringify([{ action, at: new Date().toISOString() }])]);
};
