import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { EventEmitter } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRestoreService, dispatchDatabaseRestore } from './databaseRestores.js';
import { createRestoreWorker } from './databaseRestoreWorker.js';
import { createBackupService } from './databaseBackups.js';
import { encryptTwoFactorSecret } from './twoFactorCrypto.js';
import { runPgRestore } from './restoreRuntime.js';
import { postgresEnvironment } from './backupRuntime.js';
import { createRestoreProtection } from '../middleware/restoreMaintenance.js';
import { safeRestoreJob, expireUnclaimedRestores } from './restoreControl.js';

const id = '00000000-0000-4000-8000-000000000001';
const safetyId = '00000000-0000-4000-8000-000000000002';
const record = { id, status: 'completed', encrypted: true, deleted_at: null, storage_key: `database/${id}/selected.dump.enc`, filename: 'selected.dump.enc', checksum: 'a'.repeat(64), size_bytes: 100, backup_type: 'manual', created_at: new Date().toISOString() };
const passwordHash = await bcrypt.hash('fresh-test-password', 4);
const body = { confirmation: 'RESTORE', acknowledgement: true, password: 'fresh-test-password' };
const env = { GITHUB_RESTORE_TOKEN: 'never-return-this-token' };

const harness = () => {
  const h = { user: { id: 1, role: 'super_admin', is_active: true, is_deleted: false, password_hash: passwordHash }, backup: { ...record }, jobs: [], objectChecks: 0, dispatched: [], audit: [], locked: false, maintenance: false };
  h.db = { async query(sql, args = []) {
    if (sql.includes('FROM users WHERE id=')) return { rows: [h.user] };
    if (sql.includes('SELECT j.id FROM recovery_control')) return { rows: h.jobs.filter(job => ['queued','preparing','restoring','validating'].includes(job.status)) };
    if (sql.includes('SELECT maintenance')) return { rows: [{ maintenance: h.maintenance }] };
    if (sql.includes('SELECT * FROM backup_records')) return { rows: [h.backup] };
    if (sql.includes('INSERT INTO recovery_control.database_restore_jobs')) {
      const job = { id: args[0], backup_id: args[1], requested_by: args[2], status: 'queued', selected_metadata: JSON.parse(args[3]), requested_at: new Date().toISOString() };
      h.jobs.push(job); return { rows: [job], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM recovery_control')) return { rows: h.jobs };
    return { rows: [], rowCount: 1 };
  } };
  h.runtime = {
    async assertObject() { h.objectChecks++; },
    async lock() { if (h.locked) return null; h.locked = true; return { async release() { h.locked = false; } }; },
  };
  h.service = createRestoreService({ db: h.db, runtime: h.runtime, env, dispatch: async job => { h.dispatched.push({ id: job.id, backup_id: job.backup_id }); return 'https://github.com/Tsukimitisu/10th-West-E-Commerce-System/actions/runs/123'; }, audit: async (_db, event) => h.audit.push(event) });
  return h;
};

test('fresh password, exact confirmation and acknowledgment are mandatory; no job is created on failure', async () => {
  for (const patch of [{ password: 'wrong' }, { confirmation: 'restore' }, { acknowledgement: false }, { database_url: 'untrusted' }]) {
    const h = harness();
    await assert.rejects(h.service.request(id, 1, { ...body, ...patch }), error => [400,403].includes(error.status));
    assert.equal(h.jobs.length, 0); assert.equal(h.dispatched.length, 0);
  }
});

test('enrolled 2FA requires fresh current TOTP, not a recovery-code bypass', async () => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = 'unit-only-two-factor-key-32-characters';
  const h = harness(); const secret = speakeasy.generateSecret().base32;
  Object.assign(h.user, { two_factor_enabled: true, two_factor_secret: encryptTwoFactorSecret(secret) });
  await assert.rejects(h.service.request(id, 1, { ...body, totp_code: 'wrong' }), { code: 'RESTORE_TOTP' });
  const job = await h.service.request(id, 1, { ...body, totp_code: speakeasy.totp({ secret, encoding: 'base32' }) });
  assert.equal(job.status, 'queued');
});

test('failed, deleted, unencrypted or checksum-less backups cannot be dispatched', async () => {
  for (const patch of [{ status: 'failed' }, { deleted_at: new Date() }, { encrypted: false }, { checksum: null }]) {
    const h = harness(); Object.assign(h.backup, patch);
    await assert.rejects(h.service.request(id, 1, body), { code: 'RESTORE_BACKUP_INVALID' });
    assert.equal(h.dispatched.length, 0);
  }
  const h = harness(); h.runtime.assertObject = async () => { throw new Error('missing'); };
  await assert.rejects(h.service.request(id, 1, body)); assert.equal(h.dispatched.length, 0);
});

test('valid request creates an auditable job without password, TOTP, storage key or token in API response', async () => {
  const h = harness(); const job = await h.service.request(id, 1, body);
  assert.equal(job.backup_id, id); assert.equal(h.objectChecks, 1);
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.audit[0].action, 'DATABASE_RESTORE_REQUESTED');
  assert.doesNotMatch(JSON.stringify(job), /fresh-test-password|never-return|storage_key|password_hash|two_factor_secret/);
  assert.doesNotMatch(JSON.stringify(h.jobs), /fresh-test-password|never-return/);
});

test('second request is rejected while queued or protected maintenance is active', async () => {
  const h = harness(); await h.service.request(id, 1, body);
  await assert.rejects(h.service.request(id, 1, body), { code: 'RESTORE_BUSY', status: 409 });
  const protectedDb = harness(); protectedDb.maintenance = true;
  await assert.rejects(protectedDb.service.request(id, 1, body), { code: 'RESTORE_BUSY' });
});

test('GitHub dispatch sends only opaque identifiers as workflow inputs and validates returned run URL', async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(calls.length === 1 ? { default_branch: 'main' } : { html_url: 'https://github.com/Tsukimitisu/10th-West-E-Commerce-System/actions/runs/123' }), { status: 200 }); };
  const url = await dispatchDatabaseRestore({ id: safetyId, backup_id: id }, env, request);
  assert.match(url, /actions\/runs\/123$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), { ref: 'main', inputs: { restore_job_id: safetyId, backup_id: id } });
  assert.doesNotMatch(calls[1].options.body, /never-return|password|DATABASE_URL/);
  await assert.rejects(dispatchDatabaseRestore({ id, backup_id: id }, env, async () => { throw new Error(env.GITHUB_RESTORE_TOKEN); }), error => !error.message.includes(env.GITHUB_RESTORE_TOKEN));
});

const workerHarness = () => {
  const h = { maintenance: false, calls: [], job: { id: safetyId, backup_id: id, requested_by: 1, status: 'queued', destructive_started: false, selected_metadata: { ...record }, events: [] }, safety: { ...record, id: safetyId, filename: 'safety.dump.enc', storage_key: `database/${safetyId}/safety.dump.enc` } };
  h.restoredRecords = new Map([[id, { ...record, status: 'running', checksum: null, size_bytes: null }]]);
  h.db = { async query(sql, args = []) {
    if (sql.startsWith('UPDATE recovery_control.database_restore_jobs j SET')) { if (h.job.status !== 'queued') return { rows: [] }; h.job.status = 'preparing'; return { rows: [h.job], rowCount: 1 }; }
    if (sql.startsWith('SELECT * FROM backup_records')) return { rows: [args[0] === id ? record : h.safety] };
    if (sql.includes('SET maintenance=true')) h.maintenance = true;
    if (sql.includes('SET maintenance=false')) h.maintenance = false;
    if (sql.includes('SET events =')) h.job.events.push(...JSON.parse(args[1]));
    if (sql.includes('SET safety_backup_id=')) { h.job.safety_backup_id = args[1]; h.job.safety_metadata = JSON.parse(args[2]); }
    if (sql.includes("SET status='restoring'")) { if (!h.job.safety_backup_id) return { rows: [], rowCount: 0 }; h.job.destructive_started = true; h.job.status = 'restoring'; }
    if (sql.includes('SET status=$2')) { h.job.status = args[1]; h.job.phase = args[2]; }
    if (sql.startsWith('WITH finished AS')) h.job.status = 'completed';
    if (sql.includes("SET status='failed'")) { if (['completed','failed'].includes(h.job.status)) return { rows: [] }; h.job.status = 'failed'; h.job.failure_code = args[1]; }
    if (sql.startsWith('INSERT INTO backup_records')) {
      h.calls.push('preserve');
      if (!h.restoredRecords.has(args[0]) || sql.includes('DO UPDATE SET')) h.restoredRecords.set(args[0], { id: args[0], status: 'completed', checksum: args[9], size_bytes: args[8] });
    }
    return { rows: [h.job], rowCount: 1 };
  } };
  h.runtime = Object.fromEntries(['drain','assertHeld','inspect','restore','migrate','validate','cleanup'].map(name => [name, async () => { h.calls.push(name); }]));
  h.runtime.download = async () => { h.calls.push('download'); return 'encrypted'; };
  h.runtime.checksum = async () => record.checksum;
  h.runtime.decrypt = async () => { h.calls.push('decrypt'); return 'verified.dump'; };
  h.backupRuntime = { async lock() { return { async assertHeld() {}, async release() {} }; }, async assertObject() {} };
  h.safetyService = () => ({ async request() { h.calls.push('safety'); return { completion: Promise.resolve({ status: 'completed', id: safetyId }) }; } });
  h.worker = () => createRestoreWorker({ db: h.db, runtime: h.runtime, backupRuntime: h.backupRuntime, safetyService: h.safetyService, audit: async () => {} });
  return h;
};

test('worker requires safety completion, checksum, authenticated decryption and archive inspection in order', async () => {
  const h = workerHarness(); const result = await h.worker().run(safetyId, id);
  assert.equal(result.status, 'completed'); assert.equal(h.maintenance, false);
  assert.deepEqual(h.calls, ['drain','safety','download','decrypt','inspect','assertHeld','restore','migrate','validate','preserve','preserve','cleanup']);
  assert.equal(h.job.safety_backup_id, safetyId);
  assert.equal(h.restoredRecords.get(id).status, 'completed');
  assert.equal(h.restoredRecords.get(id).checksum, record.checksum);
  assert.equal(h.restoredRecords.get(safetyId).size_bytes, record.size_bytes);
  assert.ok(h.job.events.some(event => event.action === 'DATABASE_RESTORE_COMPLETED'));
});

for (const seam of ['safety', 'checksum', 'decrypt', 'inspect']) test(`${seam} failure aborts before destructive restore and releases maintenance`, async () => {
  const h = workerHarness();
  if (seam === 'safety') h.safetyService = () => ({ async request() { return { completion: Promise.resolve({ status: 'failed' }) }; } });
  else if (seam === 'checksum') h.runtime.checksum = async () => 'b'.repeat(64);
  else h.runtime[seam] = async () => { throw new Error('private worker error'); };
  await assert.rejects(h.worker().run(safetyId, id));
  assert.equal(h.calls.includes('restore'), false); assert.equal(h.job.status, 'failed'); assert.equal(h.maintenance, false);
});

for (const seam of ['restore', 'migrate', 'validate']) test(`${seam} failure retains maintenance and accurate destructive state`, async () => {
  const h = workerHarness(); h.runtime[seam] = async () => { throw new Error('internal'); };
  await assert.rejects(h.worker().run(safetyId, id));
  assert.equal(h.job.status, 'failed'); assert.equal(h.job.destructive_started, true); assert.equal(h.maintenance, true);
});

test('replayed or invalid job cannot execute restore', async () => {
  const h = workerHarness(); h.job.status = 'completed';
  await assert.rejects(h.worker().run(safetyId, id), { code: 'RESTORE_JOB_INVALID' });
  assert.equal(h.calls.includes('restore'), false);
});

test('maintenance rejects application mutations, drains leases and allows only health/recovery monitoring', async () => {
  const calls = []; let maintenance = true;
  const pool = { async connect() { return { async query(sql) { calls.push(sql); return { rows: [{ acquired: true, maintenance }] }; }, release() { calls.push('release'); } }; } };
  const protection = createRestoreProtection(pool);
  const blocked = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await protection.middleware({ path: '/api/orders', method: 'POST' }, blocked, () => assert.fail('write bypassed maintenance'));
  assert.equal(blocked.code, 503); assert.equal(blocked.body.code, 'SYSTEM_RESTORE_IN_PROGRESS');
  let allowed = false;
  await protection.middleware({ path: `/api/admin/backups/restores/${id}`, method: 'GET' }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  await assert.rejects(protection.run(async () => assert.fail('cleanup bypassed maintenance')));
  maintenance = false; const response = new EventEmitter();
  await protection.middleware({ path: '/api/orders', method: 'POST' }, response, () => { allowed = true; });
  response.emit('finish'); await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('ROLLBACK'));
});

test('an aborted browser keeps its write lease until the async handler ends', async () => {
  let released = false;
  const pool = { async connect() { return { async query() { return { rows: [{ acquired: true, maintenance: false }] }; }, release() { released = true; } }; } };
  const protection = createRestoreProtection(pool);
  const response = new EventEmitter(); response.end = () => {}; response.destroyed = true;
  await protection.middleware({ path: '/api/orders', method: 'POST' }, response, () => {});
  response.emit('close'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(released, false);
  response.end(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(released, true);
});

test('unclaimed requests expire without changing claimed workers or destructive maintenance', async () => {
  let sql;
  await expireUnclaimedRestores({ async query(value) { sql = value; return { rows: [] }; } });
  assert.match(sql, /WHERE status='queued' AND requested_at < NOW\(\)-INTERVAL '15 minutes'/);
  assert.match(sql, /DATABASE_RESTORE_FAILED/);
  assert.doesNotMatch(sql, /SET maintenance=false/);
});

test('maintenance guards session writes without letting slow request bodies occupy recovery leases', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const guard = server.indexOf('app.use(restoreProtection.middleware)');
  assert.ok(guard > server.indexOf('app.use(express.urlencoded'));
  assert.ok(guard < server.indexOf('app.use(sessionMiddleware)'));
});

test('pg_restore spawn uses shell:false and secure pgpass; password never enters command arguments', async () => {
  let spawned;
  const spawn = (binary, args, options) => { spawned = { binary, args, options }; const child = new EventEmitter(); queueMicrotask(() => child.emit('close', 0)); return child; };
  const directory = await mkdtemp(path.join(tmpdir(), 'restore-test-'));
  try {
    const commandEnv = await postgresEnvironment({ connectionString: 'postgresql://user:private-password@localhost/database', ssl: { rejectUnauthorized: true } }, directory, { PATH: 'safe-path' });
    await runPgRestore('pg_restore', ['--dbname=database', 'verified.dump'], commandEnv, undefined, spawn);
    assert.equal(spawned.options.shell, false); assert.doesNotMatch(JSON.stringify(spawned.args), /private-password|postgresql:/);
    assert.match(await readFile(commandEnv.PGPASSFILE, 'utf8'), /private-password/);
    assert.equal(commandEnv.PGPASSWORD, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('active selected/safety backups cannot be deleted and private metadata is not serialized', async () => {
  const db = { async query(sql) { return { rows: sql.includes('recovery_control') ? [{ id: safetyId }] : [record] }; } };
  const service = createBackupService({ db, runtime: { async lock() { return { async release() {} }; }, async remove() { assert.fail('protected storage deleted'); } }, config: { retentionDays: 14 } });
  await assert.rejects(service.delete(id), { code: 'RESTORE_BUSY' });
  const serialized = safeRestoreJob({ ...workerHarness().job, github_run_url: 'javascript:alert(1)', safety_metadata: record });
  assert.equal(serialized.github_run_url, null);
  assert.doesNotMatch(JSON.stringify(serialized), /storage_key|safety_metadata|selected_metadata|password/);
});
