import express from 'express';
import { getOperationsDashboard } from '../controllers/dashboardController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get(
  '/stats',
  authenticateToken,
  requireRole('super_admin', 'admin', 'owner', 'store_staff', 'cashier'),
  getOperationsDashboard
);

export default router;
