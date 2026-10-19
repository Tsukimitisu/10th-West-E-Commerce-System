import pg from 'pg';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import knex from 'knex';
import databaseConfig from '../config/databaseConfig.cjs';
import { BackupError, encryptionKey } from './backupConfig.js';
import { decryptBackup } from './backupCrypto.js';
import { postgresEnvironment } from './backupRuntime.js';
import { RESTORE_WRITE_LOCK } from './restoreControl.js';
import { checkCoreDatabaseReadiness } from './coreReadiness.js';

export const runPgRestore = (binary, args, env, signal, spawnProcess = spawn) => new Promise((resolve, reject) => {
  const child = spawnProcess(binary, args, { env, signal, shell: false, windowsHide: true, stdio: 'ignore' });
  let failed = false;
  child.once('error', () => { failed = true; });
  child.once('close', code => code === 0 && !failed ? resolve() : reject(new BackupError('PG_RESTORE_FAILED', 'PostgreSQL recovery command failed.')));
});

export const createRestoreRuntime = (env = process.env) => {
  let directory;
  let commandEnv;
  let drainClient;
  const binary = env.PG_RESTORE_PATH || 'pg_restore';
  const signal = AbortSignal.timeout(60 * 60 * 1000);
  return {
    async drain() {
      const config = databaseConfig.createDatabaseConfig({ env: { ...env, DATABASE_URL: env.BACKUP_DATABASE_URL, SUPABASE_DB_URL: '', TEST_DATABASE_URL: '' }, sources: {} });
      if (!env.BACKUP_DATABASE_URL || config.safeMetadata.connectionMode === 'transaction') throw new BackupError('RESTORE_CONNECTION', 'A session connection is required for recovery.');
      drainClient = new pg.Client({ ...config.pgPoolConfig, query_timeout: 45000 });
      drainClient.on('error', () => {});
      await drainClient.connect();
      await drainClient.query("SET lock_timeout='30s'");
      await drainClient.query('SELECT pg_advisory_lock($1)', [RESTORE_WRITE_LOCK]);
    },
    async assertHeld() { if (!drainClient) throw new BackupError('RESTORE_LOCK_LOST', 'Recovery write protection is unavailable.'); await drainClient.query('SELECT 1'); },
    async download(record) {
      directory = await mkdtemp(path.join(tmpdir(), '10thwest-restore-'));
      await chmod(directory, 0o700);
      const cloudKey = /^database\/[a-f\d-]{36}\/[\w.-]+\.dump\.enc$/i.test(record.storage_key);
      const recoveryKey = record.source === 'uploaded_recovery' && record.storage_key === `recovery-uploads/${record.id}/snapshot.dump.enc`;
      if (!cloudKey && !recoveryKey) throw new BackupError('RESTORE_OBJECT', 'Backup object key is invalid.');
      const target = path.join(directory, 'selected.dump.enc');
      const bucket = env.BACKUP_STORAGE_BUCKET || 'database-backups';
      const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${record.storage_key.split('/').map(encodeURIComponent).join('/')}`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY }, signal,
      });
      if (!response.ok || !response.body) throw new BackupError('RESTORE_DOWNLOAD', 'Private backup download failed.');
      let received = 0;
      const limit = Number(record.size_bytes);
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new BackupError('RESTORE_SIZE', 'Backup size is unavailable.');
      const bounded = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length;
        callback(received > limit ? new BackupError('RESTORE_SIZE', 'Backup size does not match its record.') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal });
      if (received !== limit) throw new BackupError('RESTORE_SIZE', 'Backup size does not match its record.');
      return target;
    },
    async checksum(file) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      return hash.digest('hex');
    },
    async decrypt(file) {
      const target = path.join(directory, 'verified.dump');
      await decryptBackup(file, target, encryptionKey(env));
      return target;
    },
    async inspect(file) {
      await runPgRestore(binary, ['--list', file], { PATH: env.PATH, SystemRoot: env.SystemRoot }, signal);
    },
    async restore(file) {
      // Active application DATABASE_URL, not a browser or workflow input.
      const config = databaseConfig.createDatabaseConfig({ env: { ...env, DATABASE_URL: env.DATABASE_URL, SUPABASE_DB_URL: '', TEST_DATABASE_URL: '' }, sources: {} });
      commandEnv = await postgresEnvironment(config, directory, env);
      await runPgRestore(binary, ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--no-password', '--exit-on-error', '--verbose', '--single-transaction', '--schema=public', `--dbname=${commandEnv.PGDATABASE}`, file], commandEnv, signal);
    },
    async migrate() {
      const require = createRequire(import.meta.url);
      const migrationDb = knex(require('../../knexfile.cjs'));
      try { await migrationDb.migrate.latest(); if (await migrationDb.migrate.status() !== 0) throw new Error(); }
      catch { throw new BackupError('RESTORE_MIGRATIONS', 'Controlled database migrations failed.'); }
      finally { await migrationDb.destroy(); }
    },
    async validate(db) {
      await checkCoreDatabaseReadiness(db);
      const state = await db.query('SELECT is_locked FROM knex_migrations_lock');
      if (state.rows.length !== 1 || Number(state.rows[0].is_locked) !== 0) throw new BackupError('RESTORE_SCHEMA', 'Migration state is not ready.');
    },
    async cleanup() {
      if (drainClient) {
        await drainClient.query('SELECT pg_advisory_unlock($1)', [RESTORE_WRITE_LOCK]).catch(() => {});
        await drainClient.end().catch(() => {});
      }
      if (directory && path.dirname(path.resolve(directory)) === path.resolve(tmpdir())) await rm(directory, { recursive: true, force: true });
    },
  };
};
