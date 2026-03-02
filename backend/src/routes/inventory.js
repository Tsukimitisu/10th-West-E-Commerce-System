import express from 'express';
import {
  getInventory,
  getLowStockProducts,
  updateStock,
  bulkUpdateStock,
  getStockAdjustments,
  createStockAdjustment
} from '../controllers/inventoryController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All inventory routes require admin, super_admin, owner, or store_staff authentication
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getInventory);
router.get('/low-stock', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getLowStockProducts);
router.get('/adjustments', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getStockAdjustments);
router.post('/adjustments', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), createStockAdjustment);
router.put('/:productId', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), updateStock);
router.post('/bulk-update', authenticateToken, requireRole('admin', 'super_admin', 'owner'), bulkUpdateStock);

export default router;
