import assert from 'node:assert/strict';
import test from 'node:test';
import { backupConfig } from './backupConfig.js';
import { createBackupService } from './databaseBackups.js';

const statusAt = async (time, { checked = '2026-10-18T18:15:00Z', records = [], env = {} } = {}) => {
  const config = backupConfig({ BACKUP_ENABLED: 'true', ...env });
  const db = { async query(sql, args = []) {
    assert.match(sql, /b\.backup_type = 'automatic' AND b\.daily_key = \$1/);
    assert.match(sql, /b\.status = 'completed' AND b\.deleted_at IS NULL/);
    assert.match(sql, /b\.status = 'failed'/);
    const due = records.filter(record => record.backup_type === 'automatic' && record.daily_key === args[0]);
    return { rows: [{ scheduler_last_checked_at: checked,
      due_completed: due.some(record => record.status === 'completed' && !record.deleted_at),
      due_failed: due.some(record => record.status === 'failed'),
    }] };
  } };
  const service = createBackupService({ db, runtime: { async ready() {} }, config, now: () => new Date(time) });
  return service.status(); // Read-only status: never creates or uploads a backup.
};
const completed = { backup_type: 'automatic', daily_key: 'automatic-2026-10-19', status: 'completed' };

test('a successful daily backup remains healthy long after the old 45-minute heartbeat deadline', async () => {
  const result = await statusAt('2026-10-19T12:00:00Z', { records: [completed] });
  assert.equal(result.scheduler_status, 'healthy');
  assert.equal(result.next_automatic_backup, '2026-10-19T18:00:00.000Z');
});

test('an observed scheduler has a 90-minute grace period after the configured due time', async () => {
  assert.equal((await statusAt('2026-10-18T19:29:59Z')).scheduler_status, 'healthy');
  assert.equal((await statusAt('2026-10-18T19:30:00Z')).scheduler_status, 'overdue');
  assert.equal((await statusAt('2026-10-19T12:00:00Z', { checked: '2026-10-19T11:59:00Z' })).scheduler_status, 'overdue');
});

test('only a completed automatic backup for the due local date satisfies daily health', async () => {
  for (const record of [{ ...completed, backup_type: 'manual' }, { ...completed, daily_key: 'automatic-2026-10-18' }, { ...completed, status: 'running' }]) {
    assert.equal((await statusAt('2026-10-19T12:00:00Z', { records: [record] })).scheduler_status, 'overdue');
  }
  // Before 02:00 Manila, the previous local day's scheduled backup is still due.
  assert.equal((await statusAt('2026-10-19T17:59:00Z', { records: [completed] })).scheduler_status, 'healthy');
  assert.equal((await statusAt('2026-10-19T19:31:00Z', { records: [completed] })).scheduler_status, 'overdue');
});

test('configured cron and timezone control the due date and grace deadline', async () => {
  const env = { BACKUP_CRON: '30 4 * * *', BACKUP_TIMEZONE: 'Asia/Manila' };
  assert.equal((await statusAt('2026-10-18T21:59:59Z', { env })).scheduler_status, 'healthy');
  assert.equal((await statusAt('2026-10-18T22:00:00Z', { env })).scheduler_status, 'overdue');
  const utc = { BACKUP_TIMEZONE: 'UTC' };
  assert.equal((await statusAt('2026-10-19T03:30:00Z', { env: utc })).scheduler_status, 'overdue');
  assert.equal((await statusAt('2026-10-19T03:30:00Z', { env: utc, records: [completed] })).scheduler_status, 'healthy');
});

test('unobserved and disabled scheduler statuses take precedence', async () => {
  assert.equal((await statusAt('2026-10-19T12:00:00Z', { checked: null })).scheduler_status, 'not_observed');
  assert.equal((await statusAt('2026-10-19T12:00:00Z', { checked: null, env: { BACKUP_ENABLED: 'false' } })).scheduler_status, 'disabled');
});

test('a failed due automatic run reports failed; a successful retry restores healthy', async () => {
  const failed = { ...completed, status: 'failed' };
  assert.equal((await statusAt('2026-10-18T18:20:00Z', { records: [failed] })).scheduler_status, 'failed');
  assert.equal((await statusAt('2026-10-19T12:00:00Z', { records: [failed, completed] })).scheduler_status, 'healthy');
  assert.equal((await statusAt('2026-10-18T18:20:00Z', { records: [{ ...failed, daily_key: 'automatic-2026-10-18' }] })).scheduler_status, 'healthy');
});

test('retention defaults to 14 days and explicit configuration still wins', () => {
  assert.equal(backupConfig({}).retentionDays, 14);
  assert.equal(backupConfig({ BACKUP_RETENTION_DAYS: '30' }).retentionDays, 30);
});
