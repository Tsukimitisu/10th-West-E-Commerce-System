import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encryptBackup, decryptBackup } from './backupCrypto.js';
import { createBackupRuntime, runPgDump } from './backupRuntime.js';
import databaseConfig from '../config/databaseConfig.cjs';
import pg from 'pg';
afterEach(() => mock.restoreAll());

test('AES-256-GCM roundtrip authenticates data; wrong keys and tampering fail', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'backup-unit-'));
  try {
    const raw = path.join(directory, 'source');
    const encrypted = path.join(directory, 'encrypted');
    await writeFile(raw, 'isolated sensitive database sample');
    const result = await encryptBackup(raw, encrypted, Buffer.alloc(32, 5));
    assert.match(result.checksum, /^[a-f\d]{64}$/);
    assert.equal((await readFile(encrypted)).includes(Buffer.from('sensitive database')), false);
    await decryptBackup(encrypted, path.join(directory, 'verified'), Buffer.alloc(32, 5));
    assert.equal(await readFile(path.join(directory, 'verified'), 'utf8'), 'isolated sensitive database sample');
    await assert.rejects(decryptBackup(encrypted, path.join(directory, 'wrong'), Buffer.alloc(32, 6)));
    const tampered = await readFile(encrypted); tampered[25] ^= 1; await writeFile(encrypted, tampered);
    await assert.rejects(decryptBackup(encrypted, path.join(directory, 'tampered'), Buffer.alloc(32, 5)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing pg_dump rejects without returning command output or credentials', async () => {
  await assert.rejects(runPgDump('nonexistent-pgdump-unit-test-10thwest', ['--version'], { PATH: '' }, AbortSignal.timeout(2000)), error => error.code === 'PG_DUMP_UNAVAILABLE' && !error.message.includes('PATH'));
});

test('public or unavailable Supabase bucket is rejected before backup generation', async () => {
  const metadata = { database: 'postgres', projectRef: 'unit', host: 'unit', connectionMode: 'session' };
  mock.method(databaseConfig, 'getDatabaseConfig', () => ({ safeMetadata: metadata }));
  mock.method(databaseConfig, 'createDatabaseConfig', () => ({ safeMetadata: metadata }));
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'database-backups', name: 'database-backups', public: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const runtime = createBackupRuntime({ BACKUP_ENCRYPTION_KEY: 'a'.repeat(64), BACKUP_DATABASE_URL: 'test-not-used', SUPABASE_URL: 'https://unit.example.test', SUPABASE_SERVICE_ROLE_KEY: 'unit-service-key', PG_DUMP_PATH: process.execPath });
  await assert.rejects(runtime.ready(), { code: 'BACKUP_STORAGE' });
});

test('session-pooler advisory lock is explicitly released before disconnecting', async () => {
  const metadata = { database: 'postgres', projectRef: 'unit', host: 'unit', connectionMode: 'session' };
  mock.method(databaseConfig, 'getDatabaseConfig', () => ({ safeMetadata: metadata }));
  mock.method(databaseConfig, 'createDatabaseConfig', () => ({ safeMetadata: metadata }));
  const calls = [];
  mock.method(pg, 'Client', function () {
    return { on() {}, async connect() {}, async query(sql) { calls.push(sql); return { rows: [{ locked: true }] }; }, async end() { calls.push('disconnect'); } };
  });
  const runtime = createBackupRuntime({ BACKUP_DATABASE_URL: 'test-not-used' });
  const lock = await runtime.lock();
  await lock.release();
  assert.match(calls.at(-2), /pg_advisory_unlock/);
  assert.equal(calls.at(-1), 'disconnect');
});
