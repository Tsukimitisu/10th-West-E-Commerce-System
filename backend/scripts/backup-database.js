import pool from '../src/config/database.js';
import { backupConfig } from '../src/services/backupConfig.js';
import { createBackupRuntime } from '../src/services/backupRuntime.js';
import { createBackupService } from '../src/services/databaseBackups.js';
import { runScheduledBackup } from '../src/services/backupScheduler.js';

try {
  const config = backupConfig();
  const service = createBackupService({ db: pool, runtime: createBackupRuntime(), config });
  const result = await runScheduledBackup({ db: pool, service, config });
  console.log(`Database backup scheduler: ${result.status}`);
  if (result.status === 'failed') process.exitCode = 1;
} catch {
  console.error('Database backup scheduler failed. Check configuration, migrations and private storage.');
  process.exitCode = 1;
} finally { await pool.end(); }
