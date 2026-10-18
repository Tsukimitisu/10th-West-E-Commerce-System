import pg from 'pg';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import databaseConfig from '../config/databaseConfig.cjs';
import { BackupError, encryptionKey } from './backupConfig.js';
import { encryptBackup } from './backupCrypto.js';

const LOCK = 108701801;
export const runPgDump = (binary, args, env, signal) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { env, signal, shell: false, windowsHide: true, stdio: 'ignore' });
  let failedToRun = false;
  child.once('error', () => { failedToRun = true; });
  // Wait for termination before releasing the job lock or removing its files.
  child.once('close', code => code === 0 && !failedToRun ? resolve() : reject(failedToRun
    ? new BackupError('PG_DUMP_UNAVAILABLE', 'pg_dump is unavailable or the backup was interrupted.')
    : new BackupError('PG_DUMP_FAILED', 'Database dump failed. Check database access and pg_dump version.')));
});

export const createBackupRuntime = (env = process.env) => {
  const bucket = env.BACKUP_STORAGE_BUCKET || 'database-backups';
  const binary = env.PG_DUMP_PATH || 'pg_dump';
  let storage;
  let binaryCheckedAt = 0;
  const client = async () => {
    if (!storage) {
      const { createClient } = await import('@supabase/supabase-js');
      if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) throw new BackupError('BACKUP_STORAGE', 'Private backup storage is not configured.');
      storage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) },
      });
    }
    return storage;
  };
  const privateBucket = async () => {
    const api = await client();
    const { data, error } = await api.storage.getBucket(bucket);
    if (error || !data || data.public !== false) throw new BackupError('BACKUP_STORAGE', 'A private backup storage bucket must be provisioned.');
    return api.storage.from(bucket);
  };
  const connection = () => {
    if (!env.BACKUP_DATABASE_URL) throw new BackupError('BACKUP_DATABASE', 'BACKUP_DATABASE_URL must use the application database direct or session connection.');
    try {
      const app = databaseConfig.getDatabaseConfig();
      const backup = databaseConfig.createDatabaseConfig({ env: { ...env, NODE_ENV: 'production', DATABASE_URL: env.BACKUP_DATABASE_URL, SUPABASE_DB_URL: '', TEST_DATABASE_URL: '' }, sources: {} });
      const a = app.safeMetadata;
      const b = backup.safeMetadata;
      if (b.connectionMode === 'transaction' || a.database !== b.database
        || (a.projectRef ? a.projectRef !== b.projectRef : a.host !== b.host)) throw new Error();
      return backup;
    } catch { throw new BackupError('BACKUP_DATABASE', 'Backup connection must identify the same application database and support session advisory locks.'); }
  };
  return {
    async ready() {
      encryptionKey(env);
      connection();
      if (Date.now() - binaryCheckedAt > 60000) {
        await runPgDump(binary, ['--version'], { PATH: env.PATH, SystemRoot: env.SystemRoot }, AbortSignal.timeout(5000));
        binaryCheckedAt = Date.now();
      }
      await privateBucket();
    },
    async lock() {
      const config = connection();
      const lockClient = new pg.Client({ ...config.pgPoolConfig, query_timeout: 10000 });
      const abort = new AbortController();
      lockClient.on('error', () => abort.abort());
      try {
        await lockClient.connect();
        const result = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK]);
        if (!result.rows[0]?.locked) { await lockClient.end(); return null; }
        return {
          signal: abort.signal,
          assertHeld: () => lockClient.query('SELECT 1'),
          async release() {
            abort.abort();
            // Session poolers may retain their PostgreSQL backend after client disconnect.
            // Release explicitly instead of depending on the provider's reset behavior.
            await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => {});
            await lockClient.end().catch(() => {});
          },
        };
      } catch { await lockClient.end().catch(() => {}); throw new BackupError('BACKUP_DATABASE', 'Backup database connection is unavailable.'); }
    },
    async prepare(record, signal) {
      const directory = await mkdtemp(path.join(tmpdir(), '10thwest-backup-'));
      const cleanup = () => {
        if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new BackupError('BACKUP_TEMP', 'Backup temporary directory is invalid.');
        return rm(directory, { recursive: true, force: true });
      };
      try {
        await chmod(directory, 0o700);
        const config = connection();
        const url = new URL(config.connectionString);
        const escape = value => String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:');
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const port = url.port || '5432';
        const database = decodeURIComponent(url.pathname.slice(1));
        const user = decodeURIComponent(url.username);
        if ([database, user, decodeURIComponent(url.password)].some(value => /[\r\n]/.test(value))) throw new BackupError('BACKUP_DATABASE', 'Backup connection credentials contain unsupported control characters.');
        const passfile = path.join(directory, 'pgpass');
        await writeFile(passfile, [host, port, database, user, decodeURIComponent(url.password)].map(escape).join(':') + '\n', { mode: 0o600 });
        const dump = path.join(directory, 'database.dump');
        const encrypted = path.join(directory, record.filename);
        const dumpEnv = {
          PATH: env.PATH, SystemRoot: env.SystemRoot, PGHOST: host, PGPORT: port,
          PGDATABASE: database, PGUSER: user, PGPASSFILE: passfile, PGCONNECT_TIMEOUT: '15',
          PGSSLMODE: config.ssl ? (config.ssl.rejectUnauthorized ? 'verify-full' : 'require') : 'disable',
          ...(env.BACKUP_PGSSLROOTCERT ? { PGSSLROOTCERT: env.BACKUP_PGSSLROOTCERT } : {}),
        };
        await runPgDump(binary, ['--format=custom', '--compress=6', '--schema=public', '--no-owner', '--no-acl', '--no-password', '--file', dump], dumpEnv, signal);
        const { size, checksum } = await encryptBackup(dump, encrypted, encryptionKey(env), signal);
        await rm(dump, { force: true });
        await rm(passfile, { force: true });
        return { path: encrypted, size, checksum, cleanup };
      } catch (error) { await cleanup(); throw error; }
    },
    async upload(record, artifact, signal) {
      await privateBucket();
      const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${record.storage_key.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' },
        body: createReadStream(artifact.path), duplex: 'half', signal,
      });
      if (!response.ok) throw new BackupError('BACKUP_UPLOAD', 'Private backup upload failed. Check storage limits and connectivity.');
      await response.body?.cancel();
    },
    async download(record) {
      const api = await privateBucket();
      const { data, error } = await api.createSignedUrl(record.storage_key, 60, { download: record.filename });
      if (error || !data?.signedUrl) throw new BackupError('BACKUP_STORAGE', 'Backup download could not be authorized.');
      return data.signedUrl;
    },
    async remove(record) {
      const api = await privateBucket();
      const { error } = await api.remove([record.storage_key]);
      if (error) throw new BackupError('BACKUP_STORAGE', 'Backup could not be deleted from private storage.');
    },
  };
};
