import { backupCreateLimiter } from '../middleware/rateLimiter.js';
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { backupConfig, BackupError } from '../services/backupConfig.js';
import { createBackupRuntime } from '../services/backupRuntime.js';
import { createBackupService } from '../services/databaseBackups.js';

let service;
const configuredService = () => (service ||= createBackupService({ db: pool, runtime: createBackupRuntime(), config: backupConfig() }));
export const createBackupsRouter = (getService = configuredService) => {
  const router = express.Router();
  router.use(authenticateToken, requireRole('super_admin'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  const handle = action => async (req, res) => {
    try {
      if (req.params.id && !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid backup ID.' });
      await action(getService(), req, res);
    } catch (error) {
      const missingMigration = error.code === '42P01';
      res.status(error instanceof BackupError ? error.status : missingMigration ? 503 : 500).json({
        message: error instanceof BackupError ? error.message : missingMigration ? 'Backup database migration is required.' : 'Backup operation failed. Check system logs.',
        code: error instanceof BackupError ? error.code : missingMigration ? 'BACKUP_MIGRATION_REQUIRED' : 'BACKUP_ERROR',
      });
    }
  };
  router.get('/', handle(async (service, _req, res) => res.json(await service.list())));
  router.get('/status', handle(async (service, _req, res) => res.json(await service.status())));
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
