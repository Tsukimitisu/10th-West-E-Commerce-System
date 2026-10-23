import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupService } from './databaseBackups.js';
import { backupConfig, scheduleWindow } from './backupConfig.js';
import { runScheduledBackup } from './backupScheduler.js';

const config = backupConfig({ BACKUP_ENABLED: 'true' });
const fixedNow = new Date('2026-10-18T18:00:00Z'); // 02:00 Manila on October 19
const harness = () => {
  const rows = [];
  const events = [];
  let locked = false;
  const counters = { prepare: 0, upload: 0, remove: [], cleanup: 0 };
  const db = { async query(sql, args = []) {
    if (sql.startsWith('INSERT INTO backup_records')) {
      const row = { id: args[0], storage_key: args[1], filename: args[2], backup_type: args[3], status: 'queued', daily_key: args[4], created_by: args[5], encrypted: true, created_at: fixedNow.toISOString() };
      rows.push(row); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE backup_records SET status = 'failed'")) {
      const updated = rows.filter(row => args.length ? row.id === args[0] : ['queued','running'].includes(row.status));
      updated.forEach(row => { row.status = 'failed'; row.error_summary = args[1]; });
      return { rows: updated, rowCount: updated.length };
    }
    if (sql.startsWith("UPDATE backup_records SET status = 'running'")) rows.find(row => row.id === args[0]).status = 'running';
    if (sql.startsWith("UPDATE backup_records SET status = 'completed'")) Object.assign(rows.find(row => row.id === args[0]), { status: 'completed', size_bytes: args[1], checksum: args[2], completed_at: fixedNow.toISOString() });
    if (sql.startsWith('UPDATE backup_records SET deleted_at')) rows.find(row => row.id === args[0]).deleted_at = fixedNow.toISOString();
    if (sql.startsWith('SELECT * FROM backup_records WHERE daily_key')) { const found = rows.filter(row => row.daily_key === args[0] && row.status === 'completed'); return { rows: found, rowCount: found.length }; }
    if (sql.startsWith('SELECT * FROM backup_records WHERE id')) { const found = rows.filter(row => row.id === args[0]); return { rows: found, rowCount: found.length }; }
    if (sql.startsWith('SELECT id FROM backup_records')) return { rows: rows.filter(row => row.status === 'completed' && !row.deleted_at).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,1) };
    if (sql.startsWith('SELECT * FROM backup_records WHERE (created_at')) return { rows: rows.filter(row => (new Date(row.created_at) < args[0] || (row.source === 'uploaded_recovery' && row.recovery_expires_at && new Date(row.recovery_expires_at) <= fixedNow)) && !row.deleted_at && ['completed','failed'].includes(row.status)) };
    if (sql.startsWith('SELECT b.*')) return { rows };
    return { rows: [], rowCount: 1 };
  } };
  const runtime = {
    async ready() {},
    async lock() {
      if (locked) return null;
      locked = true;
      return { signal: new AbortController().signal, async assertHeld() {}, async release() { locked = false; } };
    },
    async prepare() { counters.prepare++; return { path: 'encrypted-only', size: 256, checksum: 'a'.repeat(64), async cleanup() { counters.cleanup++; } }; },
    async upload() { counters.upload++; },
    async remove(row) { counters.remove.push(row.id); },
    async download() { return 'https://private.example.test/signed?token=short-lived'; },
  };
  const service = createBackupService({ db, runtime, config, now: () => fixedNow, audit: async (_db, event) => events.push(event) });
  return { db, runtime, rows, events, counters, service };
};

test('manual backup completes only after encrypted durable upload, audits and removes temporary artifact', async () => {
  const h = harness();
  const job = await h.service.request({ actor: 9 });
  assert.equal(job.backup.status, 'queued');
  assert.equal(job.backup.storage_key, undefined);
  assert.equal((await job.completion).status, 'completed');
  assert.equal(h.rows[0].status, 'completed');
  assert.equal(h.rows[0].created_by, 9);
  assert.equal(h.rows[0].encrypted, true);
  assert.equal(h.counters.upload, 1);
  assert.equal(h.counters.cleanup, 1);
  assert.ok(h.events.some(event => event.action === 'BACKUP_CREATED'));
});

for (const seam of ['ready', 'prepare', 'upload']) test(`${seam} failure creates failed metadata without leaking subprocess/storage secrets`, async () => {
  const h = harness();
  h.runtime[seam] = async () => { throw new Error('DATABASE_URL=postgres://password; secret storage credential'); };
  const job = await h.service.request();
  assert.equal((await job.completion).status, 'failed');
  assert.equal(h.rows[0].status, 'failed');
  assert.equal(h.rows[0].error_summary, 'Backup failed. Check system logs.');
  assert.doesNotMatch(JSON.stringify(await h.service.list()), /password|credential|storage_key/);
  assert.ok(h.events.some(event => event.action === 'BACKUP_FAILED'));
});

test('global lock prevents simultaneous backups and is released on completion', async () => {
  const h = harness();
  let release;
  h.runtime.prepare = () => new Promise(resolve => { release = () => resolve({ size: 1, checksum: 'b'.repeat(64), async cleanup() {} }); });
  const job = await h.service.request();
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.service.request(), { code: 'BACKUP_BUSY', status: 409 });
  release(); await job.completion;
  const next = await h.service.request();
  h.runtime.prepare = async () => ({ size: 1, checksum: 'b'.repeat(64), async cleanup() {} });
  await next.completion;
  assert.equal(h.rows.length, 2);
});

test('scheduler calls the same service and repeated daily ticks do not duplicate successful backups', async () => {
  const h = harness();
  const call = () => runScheduledBackup({ db: h.db, service: h.service, config, now: fixedNow });
  assert.equal((await call()).status, 'completed');
  assert.equal((await call()).status, 'already_completed');
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].backup_type, 'automatic');
  assert.equal(h.rows[0].daily_key, 'automatic-2026-10-19');
  assert.equal(h.counters.prepare, 1);
});

test('retention deletes expired artifacts, audits deletion and protects the newest success', async () => {
  const h = harness();
  h.rows.push({ id: 'old', backup_type: 'automatic', status: 'completed', created_at: '2026-01-01T00:00:00Z', storage_key: 'old-secret' });
  const job = await h.service.request(); await job.completion;
  assert.deepEqual(h.counters.remove, ['old']);
  assert.ok(h.rows[0].deleted_at);
  assert.ok(h.events.some(event => event.action === 'BACKUP_DELETED'));
  await assert.rejects(h.service.delete(job.backup.id, 9), { code: 'BACKUP_NEWEST' });
});

test('signed downloads require completed encrypted metadata; listing never exposes private object paths', async () => {
  const h = harness();
  const job = await h.service.request(); await job.completion;
  const result = await h.service.download(job.backup.id, 9);
  assert.equal(result.expires_in, 60);
  assert.equal(result.encrypted, true);
  assert.doesNotMatch(JSON.stringify(await h.service.list()), /storage_key|signed\?|token=/);
  h.rows[0].deleted_at = new Date();
  await assert.rejects(h.service.download(job.backup.id, 9), { code: 'BACKUP_NOT_READY' });
});

test('routine cleanup expires unused uploaded files while preserving the ordinary retention and safety backup', async () => {
  const h = harness();
  h.rows.push(
    { id: 'unused-upload', source: 'uploaded_recovery', recovery_expires_at: '2026-10-18T00:00:00Z', status: 'completed', created_at: '2026-10-18T00:00:00Z' },
    { id: 'safety-backup', source: 'system', backup_type: 'manual', status: 'completed', created_at: '2026-10-18T00:00:00Z' },
    { id: 'retained-upload', source: 'uploaded_recovery', recovery_expires_at: null, status: 'completed', created_at: '2026-10-18T00:00:00Z' },
  );
  const job = await h.service.request(); await job.completion;
  assert.deepEqual(h.counters.remove, ['unused-upload']);
  assert.equal(h.rows.find(row => row.id === 'safety-backup').deleted_at, undefined);
  assert.equal(h.rows.find(row => row.id === 'retained-upload').deleted_at, undefined);
});

test('daily schedule defaults to 02:00 Manila and invalid retention fails closed', () => {
  assert.equal(scheduleWindow(config, new Date('2026-10-18T00:00:00Z')).next, '2026-10-18T18:00:00.000Z');
  for (const retention of ['0', '-1', 'abc', '2.5']) assert.throws(() => backupConfig({ BACKUP_RETENTION_DAYS: retention }));
});

test('failed automatic backup can retry the same due day; completed day remains idempotent', async () => {
  const h = harness();
  const prepare = h.runtime.prepare;
  h.runtime.prepare = async () => { throw new Error('isolated failure'); };
  const run = () => runScheduledBackup({ db: h.db, service: h.service, config, now: fixedNow });
  assert.equal((await run()).status, 'failed');
  h.runtime.prepare = prepare;
  assert.equal((await run()).status, 'completed');
  assert.equal((await run()).status, 'already_completed');
  assert.equal(h.rows.filter(row => row.status === 'completed').length, 1);
});

test('a worker interrupted by restart is marked failed before a new locked job starts', async () => {
  const h = harness();
  h.rows.push({ id: 'interrupted', status: 'running', backup_type: 'manual', created_at: fixedNow.toISOString() });
  const job = await h.service.request(); await job.completion;
  assert.equal(h.rows[0].status, 'failed');
  assert.ok(h.events.some(event => event.action === 'BACKUP_FAILED' && event.entityId === 'interrupted'));
});
