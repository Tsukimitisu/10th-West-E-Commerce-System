import { backupCreateLimiter, backupRestoreLimiter, backupRecoveryUploadLimiter } from '../middleware/rateLimiter.js';
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { backupConfig, BackupError } from '../services/backupConfig.js';
import { createBackupRuntime } from '../services/backupRuntime.js';
import { createBackupService } from '../services/databaseBackups.js';
import { createRestoreService } from '../services/databaseRestores.js';
import { validateCsrf } from '../middleware/csrf.js';
import { createRecoveryUploadService } from '../services/recoveryUploads.js';

let service;
let restoreService;
let recoveryUploadService;
const configuredService = () => (service ||= createBackupService({ db: pool, runtime: createBackupRuntime(), config: backupConfig() }));
const configuredRestoreService = () => (restoreService ||= createRestoreService({ db: pool, runtime: createBackupRuntime() }));
const configuredUploadService = () => (recoveryUploadService ||= createRecoveryUploadService({ db: pool, runtime: createBackupRuntime() }));
const requireSession = (fresh = false) => (req, res, next) => {
  const age = Date.now() - Number(req.session?.auth?.authenticatedAt || 0);
  if (!req.session?.auth?.tokenHash || req.session.auth.userId !== req.user.id || (fresh && (!Number.isFinite(age) || age < -30000 || age > 15 * 60000)))
    return res.status(401).json({ code: 'SESSION_REQUIRED', message: 'Please sign in again before continuing with recovery.' });
  return next();
};
export const createBackupsRouter = (getService = configuredService, getRestoreService = configuredRestoreService, getUploadService = configuredUploadService) => {
  const router = express.Router();
  router.use(authenticateToken, requireRole('super_admin'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  const handle = action => async (req, res) => {
    try {
      if ((req.params.id || req.params.jobId) && !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(req.params.id || req.params.jobId)) return res.status(400).json({ message: 'Invalid backup or restore ID.' });
      await action(getService(), req, res);
    } catch (error) {
      if (error.code?.startsWith('RECOVERY_UPLOAD')) res.set('Connection', 'close');
      const missingMigration = error.code === '42P01';
      res.status(error instanceof BackupError ? error.status : missingMigration ? 503 : 500).json({
        message: error instanceof BackupError ? error.message : missingMigration ? 'Backup database migration is required.' : 'Backup operation failed. Check system logs.',
        code: error instanceof BackupError ? error.code : missingMigration ? 'BACKUP_MIGRATION_REQUIRED' : 'BACKUP_ERROR',
      });
    }
  };
  router.get('/', handle(async (service, _req, res) => res.json(await service.list())));
  router.get('/status', handle(async (service, req, res) => res.json({ ...await service.status(), ...await getRestoreService().overview(req.user.id) })));
  router.get('/restores/:jobId', handle(async (_service, req, res) => res.json(await getRestoreService().status(req.params.jobId))));
  router.post('/recovery-upload', backupRecoveryUploadLimiter, requireSession(true), validateCsrf, handle(async (_service, req, res) => {
    res.status(201).json({ backup: await getUploadService().receive(req, req.user.id) });
  }));
  router.post('/:id/restore', backupRestoreLimiter, requireSession(), validateCsrf, handle(async (_service, req, res) => {
    res.status(202).json({ job: await getRestoreService().request(req.params.id, req.user.id, req.body, req) });
  }));
  router.post('/', backupCreateLimiter, handle(async (service, req, res) => {
    const job = await service.request({ actor: req.user.id, req });
    job.completion.catch(() => console.error('Backup worker could not persist its final status.'));
    res.status(202).json({ backup: job.backup });
  }));
  router.get('/:id/download', handle(async (service, req, res) => res.json(await service.download(req.params.id, req.user.id, req))));
  router.delete('/:id', handle(async (service, req, res) => { await service.delete(req.params.id, req.user.id, req); res.json({ message: 'Backup deleted.' }); }));
  return router;
};
export default createBackupsRouter();
