import express from 'express';
import {
  cancelCheckout,
  cleanupExpiredReservations,
  confirmCheckout,
  createCheckout,
  getCheckout,
} from '../controllers/secureCheckoutController.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticateToken, createCheckout);
router.post('/confirm', authenticateToken, confirmCheckout);
router.post(
  '/cleanup-expired',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner', 'store_staff'),
  requirePermission('inventory.manage'),
  cleanupExpiredReservations,
);
router.get('/:checkoutId', authenticateToken, getCheckout);
router.post('/:checkoutId/cancel', authenticateToken, cancelCheckout);

export default router;
