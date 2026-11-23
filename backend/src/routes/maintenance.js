import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { accountMutationLimiter } from '../middleware/rateLimiter.js';
import { validateCsrf } from '../middleware/csrf.js';
import { changeMaintenance } from '../services/maintenanceControl.js';
import { operationsStatus } from '../services/operationsDiagnostics.js';
import pool from '../config/database.js';

export const createMaintenanceRouter = ({ db = pool, authenticate = authenticateToken } = {}) => {
  const router = express.Router();
  router.use(authenticate, requireRole('super_admin'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', async (_req, res) => {
    try { res.json({ ...await operationsStatus(db), requires_totp: Boolean(_req.user.two_factor_enabled) }); }
    catch { res.status(503).json({ code: 'OPERATIONS_UNAVAILABLE', message: 'System checks could not be completed. Please refresh shortly.' }); }
  });
  router.put('/', accountMutationLimiter, validateCsrf, async (req, res) => {
    try { res.json(await changeMaintenance(db, req.user.id, req.body, req)); }
    catch (error) {
      const known = String(error.code || '').startsWith('MAINTENANCE_') || ['FRESH_AUTH_REQUIRED', 'FRESH_TOTP_REQUIRED', 'FORBIDDEN'].includes(error.code);
      res.status(known ? error.status : 503).json({ code: known ? error.code : 'MAINTENANCE_CHANGE_UNAVAILABLE',
        message: known ? error.message : 'Maintenance could not be changed. Refresh the status before trying again.' });
    }
  });
  return router;
};
