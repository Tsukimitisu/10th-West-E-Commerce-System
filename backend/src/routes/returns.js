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
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Customer routes
router.post('/', authenticateToken, createReturn);
router.get('/my-returns', authenticateToken, getUserReturns);
router.get('/store-credit', authenticateToken, getUserStoreCredit);
router.get('/store-credit/history', authenticateToken, getStoreCreditHistory);
router.get('/:id', authenticateToken, getReturnById);

// Admin routes
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getAllReturns);
router.put('/:id/approve', authenticateToken, requireRole('admin', 'super_admin', 'owner'), approveReturn);
router.put('/:id/reject', authenticateToken, requireRole('admin', 'super_admin', 'owner'), rejectReturn);
router.post('/:id/refund', authenticateToken, requireRole('admin', 'super_admin', 'owner'), processRefund);

export default router;
