import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import {
  createPosOrder,
  getPosCapabilities,
  getPosDailySummary,
  getPosOrder,
  getPosProducts,
  getPosReceipt,
  listPosOrders,
  validatePosCart,
  voidPosOrder,
} from '../controllers/posController.js';

const router = express.Router();
const allowedRoles = requireRole('admin', 'super_admin', 'owner', 'store_staff', 'cashier');
const canAccessPos = [authenticateToken, allowedRoles, requirePermission('pos.access')];

router.get('/products', ...canAccessPos, getPosProducts);
router.get('/capabilities', ...canAccessPos, getPosCapabilities);
router.post('/validate-cart', ...canAccessPos, validatePosCart);
router.post('/orders', ...canAccessPos, createPosOrder);
router.get('/orders', ...canAccessPos, listPosOrders);
router.get('/orders/:id', ...canAccessPos, getPosOrder);
router.get('/orders/:id/receipt', ...canAccessPos, getPosReceipt);
router.post('/orders/:id/void', ...canAccessPos, requirePermission('pos.void'), voidPosOrder);
router.get('/daily-summary', ...canAccessPos, getPosDailySummary);

export default router;
