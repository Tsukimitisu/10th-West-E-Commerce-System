import assert from 'node:assert/strict';
import test, { before, after, mock, afterEach } from 'node:test';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRecoveryUploadService, recoveryUploadLimit } from './recoveryUploads.js';
import { createBackupRuntime } from './backupRuntime.js';
import { createRestoreRuntime } from './restoreRuntime.js';
import { encryptBackup } from './backupCrypto.js';

let directory; let encrypted;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'recovery-fixture-'));
  await writeFile(path.join(directory, 'raw'), 'isolated fixture, not a database');
  await encryptBackup(path.join(directory, 'raw'), path.join(directory, 'fixture.dump.enc'), Buffer.alloc(32, 7));
  encrypted = await readFile(path.join(directory, 'fixture.dump.enc'));
});
after(async () => { await rm(directory, { recursive: true, force: true }); });
afterEach(() => mock.restoreAll());

const request = (data, name = 'saved.dump.enc', extra = '', chunked = false) => {
  const boundary = 'isolated-recovery-boundary';
  const content = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="backup"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), data, Buffer.from(`\r\n${extra}--${boundary}--\r\n`)]);
  const req = Readable.from(chunked ? [...content].map(byte => Buffer.from([byte])) : [content]);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, ...(!chunked ? { 'content-length': String(content.length) } : {}) };
  req.aborted = false; return req;
};
const harness = () => {
  const h = { records: [], objects: new Map(), removed: [], uploads: 0, locked: false, events: [] };
  h.db = { async query(sql, args = []) {
    if (sql.startsWith('INSERT INTO backup_records')) {
      const row = { id: args[0], storage_key: args[1], filename: args[2], created_by: args[3], backup_type: 'manual', source: 'uploaded_recovery', status: 'running', encrypted: true, created_at: new Date().toISOString(), recovery_expires_at: new Date(Date.now() + 86400000).toISOString() };
      h.records.push(row); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE backup_records SET status='completed'")) { const row = h.records.find(row => row.id === args[0]); Object.assign(row, { status: 'completed', size_bytes: args[1], checksum: args[2] }); return { rows: [row], rowCount: 1 }; }
    if (sql.startsWith("UPDATE backup_records SET status='failed'")) Object.assign(h.records.find(row => row.id === args[0]), { status: 'failed', deleted_at: args[1] ? new Date().toISOString() : null });
    return { rows: [], rowCount: 1 };
  } };
  h.runtime = {
    async lock() { if (h.locked) return null; h.locked = true; return { async assertHeld() {}, async release() { h.locked = false; } }; },
    async uploadStream(record, stream) { h.uploads++; const chunks = []; for await (const chunk of stream) chunks.push(chunk); h.objects.set(record.storage_key, Buffer.concat(chunks)); },
    async remove(record) { h.removed.push(record.id); h.objects.delete(record.storage_key); },
  };
  h.service = createRecoveryUploadService({ db: h.db, runtime: h.runtime, env: { BACKUP_RECOVERY_MAX_UPLOAD_BYTES: '1024' }, audit: async (_db, event) => h.events.push(event) });
  return h;
};

test('valid encrypted fixture is streamed privately, hashed, distinguished and safely serialized', async () => {
  const h = harness(); const result = await h.service.receive(request(encrypted, 'saved.dump.enc', '', true), 4);
  assert.equal(result.status, 'completed'); assert.equal(result.source, 'uploaded_recovery');
  assert.equal(result.checksum, createHash('sha256').update(encrypted).digest('hex'));
  assert.equal(result.size_bytes, encrypted.length); assert.ok(result.recovery_expires_at);
  assert.match(h.records[0].storage_key, /^recovery-uploads\/[a-f\d-]{36}\/snapshot.dump.enc$/);
  assert.deepEqual([...h.objects.values()][0], encrypted);
  assert.doesNotMatch(JSON.stringify(result), /storage_key|https:|service_role|ENCRYPTION_KEY|DATABASE_URL|GITHUB/);
  assert.equal(h.events[0].action, 'RECOVERY_UPLOAD_CREATED'); assert.equal(h.locked, false);
});

for (const [name, data] of [['wrong.sql', () => encrypted], ['empty.dump.enc', () => Buffer.alloc(0)], ['bad.dump.enc', () => Buffer.from('not a 10th West encrypted database backup')], ['short.dump.enc', () => Buffer.concat([Buffer.from('10TWBK1'), Buffer.alloc(12)])]]) test(`${name} is rejected without a completed record`, async () => {
  const h = harness(); await assert.rejects(h.service.receive(request(data(), name), 4));
  assert.equal(h.records.some(row => row.status === 'completed'), false);
  assert.equal(h.objects.size, 0); assert.equal(h.locked, false);
});

test('oversized known-length and streaming uploads are rejected and partial objects removed', async () => {
  for (const chunked of [false, true]) {
    const h = harness(); const data = Buffer.concat([encrypted, Buffer.alloc(20000)]);
    await assert.rejects(h.service.receive(request(data, 'large.dump.enc', '', chunked), 4), error => error.code === 'RECOVERY_UPLOAD_SIZE');
    assert.equal(h.objects.size, 0); assert.equal(h.records.some(row => row.status === 'completed'), false);
  }
});

test('chunked multipart overhead is bounded before any file or storage allocation', async () => {
  const h = harness(); const req = Readable.from([Buffer.alloc(20000, 65)]);
  req.headers = { 'content-type': 'multipart/form-data; boundary=isolated' };
  await assert.rejects(h.service.receive(req, 4), { code: 'RECOVERY_UPLOAD_SIZE' });
  assert.equal(h.uploads, 0); assert.equal(h.records.length, 0);
});

test('extra multipart fields, malformed forms and absent files are not accepted', async () => {
  const h = harness();
  const extra = '--isolated-recovery-boundary\r\nContent-Disposition: form-data; name="database_url"\r\n\r\nnot-accepted\r\n';
  await assert.rejects(h.service.receive(request(encrypted, 'saved.dump.enc', extra), 4));
  assert.equal(h.objects.size, 0);
  const empty = Readable.from(['--empty--\r\n']); empty.headers = { 'content-type': 'multipart/form-data; boundary=empty' };
  await assert.rejects(h.service.receive(empty, 4));
});

test('storage rejection cleans up partial uploads without returning provider secrets', async () => {
  const h = harness(); h.runtime.uploadStream = async () => { throw new Error('private-storage-secret-do-not-expose'); };
  await assert.rejects(h.service.receive(request(encrypted), 4), error => !error.message.includes('private-storage-secret'));
  assert.equal(h.removed.length, 1); assert.equal(h.records[0].status, 'failed'); assert.equal(h.records[0].deleted_at, null);
});

test('client cancellation stops streaming and attempts private object cleanup', async () => {
  const h = harness(); const req = request(encrypted);
  h.runtime.uploadStream = async (_record, stream) => { req.emit('aborted'); for await (const _chunk of stream) { /* drain cancellation */ } };
  await assert.rejects(h.service.receive(req, 4)); assert.equal(h.removed.length, 1); assert.equal(h.locked, false);
});

test('unsafe size configuration is rejected; default is bounded and override works', () => {
  assert.equal(recoveryUploadLimit({}), 67108864); assert.equal(recoveryUploadLimit({ BACKUP_RECOVERY_MAX_UPLOAD_BYTES: '1048576' }), 1048576);
  for (const value of ['0','-1','512','300000000','Infinity','1.5']) assert.throws(() => recoveryUploadLimit({ BACKUP_RECOVERY_MAX_UPLOAD_BYTES: value }));
});

test('runtime refuses public storage before an upload and does not return public URLs', async () => {
  const methods = [];
  mock.method(globalThis, 'fetch', async (_url, options) => { methods.push(options?.method || 'GET'); return new Response(JSON.stringify({ id: 'database-backups', public: true }), { status: 200 }); });
  const runtime = createBackupRuntime({ SUPABASE_URL: 'https://isolated.example.test', SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key' });
  await assert.rejects(runtime.uploadStream({ storage_key: 'not-used' }, Readable.from([encrypted])), { code: 'BACKUP_STORAGE' });
  assert.equal(methods.includes('POST'), false);
});

test('existing restore runtime downloads recovery prefix and reuses authenticated GCM decryption', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return new Response(encrypted); });
  const runtime = createRestoreRuntime({ SUPABASE_URL: 'https://isolated.example.test', SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key', BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('hex') });
  try {
    const id = '00000000-0000-4000-8000-000000000001';
    const file = await runtime.download({ id, source: 'uploaded_recovery', storage_key: `recovery-uploads/${id}/snapshot.dump.enc`, size_bytes: encrypted.length });
    assert.equal(await runtime.checksum(file), createHash('sha256').update(encrypted).digest('hex'));
    const raw = await runtime.decrypt(file); assert.equal(await readFile(raw, 'utf8'), 'isolated fixture, not a database');
    assert.match(calls[0].url, /\/object\/authenticated\/database-backups\/recovery-uploads\//);
    assert.doesNotMatch(calls[0].url, /mock-service-key|token=|public/);
  } finally { await runtime.cleanup(); }
});
