import '../src/config/environment.cjs';
import pool from '../src/config/database.js';
import { createBackupRuntime } from '../src/services/backupRuntime.js';
import { backupConfig } from '../src/services/backupConfig.js';
import { createBackupService } from '../src/services/databaseBackups.js';
import { createRestoreRuntime } from '../src/services/restoreRuntime.js';
import { createRestoreWorker } from '../src/services/databaseRestoreWorker.js';

// Only the privileged workflow supplies these opaque identifiers. No command
// argument or browser field can choose a database, object key or decryption key.
const id = process.env.RESTORE_JOB_ID;
const backupId = process.env.RESTORE_BACKUP_ID;
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
let runtime;
try {
  if (process.env.GITHUB_ACTIONS !== 'true' || !uuid.test(id || '') || !uuid.test(backupId || '')) throw new Error();
  runtime = createRestoreRuntime();
  const backupRuntime = createBackupRuntime();
  const worker = createRestoreWorker({ db: pool, runtime, backupRuntime,
    safetyService: (restoreJobId, borrowedRuntime) => createBackupService({ db: pool, runtime: borrowedRuntime, config: backupConfig(), restoreJobId }),
  });
  if (process.argv.includes('--finalize')) await worker.fail(id, 'RESTORE_WORKFLOW_INTERRUPTED');
  else await worker.run(id, backupId);
  console.log('Database recovery worker finished. Check the protected restore job status.');
} catch {
  console.error('Database recovery worker stopped. Check the protected restore job status.');
  process.exitCode = 1;
} finally { await runtime?.cleanup().catch(() => {}); await pool.end(); }
