import express from 'express';
import {
  getInventory,
  getLowStockProducts,
  updateStock,
  bulkUpdateStock,
  getStockAdjustments,
  createStockAdjustment,
  batchReceiveStock,
  getStockMovements
} from '../controllers/inventoryController.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All inventory routes require admin, super_admin, owner, or store_staff authentication
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.view'), getInventory);
router.get('/low-stock', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.view'), getLowStockProducts);
router.get('/adjustments', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.view'), getStockAdjustments);
router.get('/movements', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.view'), getStockMovements);
router.post('/adjustments', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.manage'), createStockAdjustment);
router.put('/:productId', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.manage'), updateStock);
router.post('/bulk-update', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.manage'), bulkUpdateStock);
router.post('/batch-receive', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('inventory.manage'), batchReceiveStock);

export default router;
