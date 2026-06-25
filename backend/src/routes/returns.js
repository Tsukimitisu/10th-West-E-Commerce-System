import express from 'express';
import {
  createReturn,
  getUserReturns,
  getAllReturns,
  getReturnById,
  approveReturn,
  rejectReturn,
  processRefund,
  getUserStoreCredit,
  getStoreCreditHistory
} from '../controllers/returnController.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { createReturnSecure, processRefundSecure } from '../controllers/returnWorkflowController.js';

const router = express.Router();

// Customer routes
router.post('/', authenticateToken, createReturnSecure);
router.get('/my-returns', authenticateToken, getUserReturns);
router.get('/store-credit', authenticateToken, getUserStoreCredit);
router.get('/store-credit/history', authenticateToken, getStoreCreditHistory);
router.get('/:id', authenticateToken, getReturnById);

// Admin routes
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getAllReturns);
router.patch('/:id/approve', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('returns.process'), approveReturn);
router.put('/:id/approve', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('returns.process'), approveReturn);
router.patch('/:id/reject', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('returns.process'), rejectReturn);
router.put('/:id/reject', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('returns.process'), rejectReturn);
router.post('/:id/refund', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('payments.refund'), processRefundSecure);

export default router;
