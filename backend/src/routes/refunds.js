import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { processRefundSecure } from '../controllers/returnWorkflowController.js';

const router = express.Router();
router.post('/:returnId/process', authenticateToken, requireRole('admin','super_admin','owner'), requirePermission('payments.refund'), processRefundSecure);
export default router;
