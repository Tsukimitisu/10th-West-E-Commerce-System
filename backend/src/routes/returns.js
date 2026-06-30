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
import { authenticateToken, requirePermission, requirePermissionForRoles, requireRole } from '../middleware/auth.js';
import { createReturnSecure, processRefundSecure } from '../controllers/returnWorkflowController.js';

const router = express.Router();

// Customer routes
router.post('/', authenticateToken, createReturnSecure);
router.get('/my-returns', authenticateToken, getUserReturns);
router.get('/store-credit', authenticateToken, getUserStoreCredit);
router.get('/store-credit/history', authenticateToken, getStoreCreditHistory);
const operationsRoles = ['admin', 'super_admin', 'owner', 'store_staff'];
router.get('/:id', authenticateToken, requirePermissionForRoles('returns.view', ...operationsRoles), getReturnById);

// Admin routes
router.get('/', authenticateToken, requireRole(...operationsRoles), requirePermission('returns.view'), getAllReturns);
router.patch('/:id/approve', authenticateToken, requireRole(...operationsRoles), requirePermission('returns.manage'), approveReturn);
router.put('/:id/approve', authenticateToken, requireRole(...operationsRoles), requirePermission('returns.manage'), approveReturn);
router.patch('/:id/reject', authenticateToken, requireRole(...operationsRoles), requirePermission('returns.manage'), rejectReturn);
router.put('/:id/reject', authenticateToken, requireRole(...operationsRoles), requirePermission('returns.manage'), rejectReturn);
router.post('/:id/refund', authenticateToken, requireRole(...operationsRoles), requirePermission('refunds.process'), processRefundSecure);

export default router;
