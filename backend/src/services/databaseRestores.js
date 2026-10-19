import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { BackupError } from './backupConfig.js';
import { decryptTwoFactorSecret } from './twoFactorCrypto.js';
import { assertNoRestore, safeRestoreJob, recordRestoreEvent, expireUnclaimedRestores } from './restoreControl.js';
import { writeAuditLog } from '../utils/audit.js';

export const restoreGithubConfig = (env = process.env) => {
  const repository = env.GITHUB_RESTORE_REPOSITORY || 'Tsukimitisu/10th-West-E-Commerce-System';
  const workflow = env.GITHUB_RESTORE_WORKFLOW || 'database-restore.yml';
  if (!env.GITHUB_RESTORE_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[\w.-]+\.ya?ml$/.test(workflow))
    throw new BackupError('RESTORE_CONFIG', 'Database restore dispatch is not configured.');
  return { repository, workflow, token: env.GITHUB_RESTORE_TOKEN };
};

export const dispatchDatabaseRestore = async (job, env = process.env, request = fetch) => {
  const { repository, workflow, token } = restoreGithubConfig(env);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' };
  try {
    const repo = await request(`https://api.github.com/repos/${repository}`, { headers, signal: AbortSignal.timeout(10000) });
    const branch = repo.ok && (await repo.json()).default_branch;
    if (!branch || typeof branch !== 'string') throw new Error();
    const response = await request(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST', headers, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ ref: branch, inputs: { restore_job_id: job.id, backup_id: job.backup_id } }),
    });
    if (!response.ok) throw new Error();
    const data = response.status === 204 ? {} : await response.json();
    const prefix = `https://github.com/${repository}/actions/runs/`;
    return typeof data.html_url === 'string' && data.html_url.startsWith(prefix) && /^\d+$/.test(data.html_url.slice(prefix.length)) ? data.html_url : null;
  } catch { throw new BackupError('RESTORE_DISPATCH_FAILED', 'Restore workflow could not be confirmed. Check its status before retrying.'); }
};

export const validateRestoreBackup = row => {
  if (!row || row.status !== 'completed' || row.encrypted !== true || row.deleted_at
    || !/^[a-f\d]{64}$/i.test(row.checksum || '') || !row.storage_key || !row.filename)
    throw new BackupError('RESTORE_BACKUP_INVALID', 'A completed, encrypted backup with a checksum is required.', 409);
  return row;
};

export const createRestoreService = ({ db, runtime, env = process.env, dispatch = dispatchDatabaseRestore, audit = writeAuditLog }) => {
  const get = async id => {
    const result = await db.query('SELECT * FROM recovery_control.database_restore_jobs WHERE id=$1', [id]);
    if (!result.rows[0]) throw new BackupError('RESTORE_NOT_FOUND', 'Restore job not found.', 404);
    return result.rows[0];
  };
  return {
    async overview(actor) {
      await expireUnclaimedRestores(db);
      let configured = true;
      try { restoreGithubConfig(env); } catch { configured = false; }
      const user = await db.query('SELECT two_factor_enabled FROM users WHERE id=$1', [actor]);
      const jobs = await db.query('SELECT * FROM recovery_control.database_restore_jobs ORDER BY requested_at DESC LIMIT 1');
      return { restore_configured: configured, restore_requires_totp: Boolean(user.rows[0]?.two_factor_enabled), restore_job: safeRestoreJob(jobs.rows[0]) };
    },
    async request(backupId, actor, body, req) {
      if (body?.confirmation !== 'RESTORE' || body?.acknowledgement !== true)
        throw new BackupError('RESTORE_CONFIRMATION', 'Acknowledge the warning and type RESTORE.', 400);
      if (Object.keys(body).some(key => !['confirmation', 'acknowledgement', 'password', 'totp_code'].includes(key)))
        throw new BackupError('RESTORE_INPUT', 'Unsupported restore request fields.', 400);
      restoreGithubConfig(env);
      const result = await db.query('SELECT id, role, is_active, is_deleted, password_hash, two_factor_enabled, two_factor_secret FROM users WHERE id=$1', [actor]);
      const user = result.rows[0];
      if (!user || user.role !== 'super_admin' || !user.is_active || user.is_deleted) throw new BackupError('FORBIDDEN', 'Access denied.', 403);
      if (typeof body.password !== 'string' || body.password.length > 1024 || !user.password_hash || !await bcrypt.compare(body.password, user.password_hash))
        throw new BackupError('RESTORE_REAUTH', 'Current password could not be verified.', 403);
      if (user.two_factor_enabled) {
        let valid = false;
        try { valid = /^\d{6}$/.test(String(body.totp_code || '')) && speakeasy.totp.verify({ secret: decryptTwoFactorSecret(user.two_factor_secret), encoding: 'base32', token: String(body.totp_code), window: 1 }); } catch { /* fail closed */ }
        if (!valid) throw new BackupError('RESTORE_TOTP', 'A valid current authenticator code is required.', 403);
      }
      const lock = await runtime.lock();
      if (!lock) throw new BackupError('BACKUP_BUSY', 'Backup already in progress.', 409);
      let job;
      try {
        await assertNoRestore(db);
        const state = await db.query('SELECT maintenance FROM recovery_control.state WHERE id=1');
        if (state.rows[0]?.maintenance !== false) throw new BackupError('RESTORE_BUSY', 'Database recovery controls require attention.', 409);
        const record = validateRestoreBackup((await db.query('SELECT * FROM backup_records WHERE id=$1', [backupId])).rows[0]);
        await runtime.assertObject(record);
        const id = randomUUID();
        const inserted = await db.query(`INSERT INTO recovery_control.database_restore_jobs (id,backup_id,requested_by,status,selected_metadata)
          VALUES ($1,$2,$3,'queued',$4::jsonb) RETURNING *`, [id, backupId, actor, JSON.stringify(record)]);
        job = inserted.rows[0];
        await recordRestoreEvent(db, id, 'DATABASE_RESTORE_REQUESTED');
        await audit(db, { req, actorUserId: actor, action: 'DATABASE_RESTORE_REQUESTED', entityType: 'database_restore', entityId: id, metadata: { backup_id: backupId } });
      } catch (error) {
        if (job) await db.query("UPDATE recovery_control.database_restore_jobs SET status='failed', failure_code='RESTORE_REQUEST_FAILED', completed_at=NOW() WHERE id=$1 AND status='queued'", [job.id]);
        if (error.code === '23505') throw new BackupError('RESTORE_BUSY', 'Database recovery is in progress.', 409);
        throw error;
      } finally { await lock.release(); }
      // A timeout is ambiguous: retain the queued job until its 15-minute claim
      // window expires. A late GitHub dispatch must never race a second request.
      try {
        const url = await dispatch(job, env);
        await db.query('UPDATE recovery_control.database_restore_jobs SET github_run_url=$2 WHERE id=$1', [job.id, url]);
        job.github_run_url = url;
      } catch { /* status endpoint expires unclaimed requests safely */ }
      return safeRestoreJob(job);
    },
    async status(id) {
      // A worker must atomically claim within 15 minutes. Expiring queued jobs
      // cannot stop a claimed worker or release maintenance after destructive work.
      await expireUnclaimedRestores(db);
      return safeRestoreJob(await get(id));
    },
  };
};
