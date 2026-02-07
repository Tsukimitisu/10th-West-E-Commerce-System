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
router.get('/', authenticateToken, requireRole('admin'), getAllReturns);
router.put('/:id/approve', authenticateToken, requireRole('admin'), approveReturn);
router.put('/:id/reject', authenticateToken, requireRole('admin'), rejectReturn);
router.post('/:id/refund', authenticateToken, requireRole('admin'), processRefund);

export default router;
