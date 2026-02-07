import express from 'express';
import {
  getInventory,
  getLowStockProducts,
  updateStock,
  bulkUpdateStock
} from '../controllers/inventoryController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All inventory routes require admin authentication
router.get('/', authenticateToken, requireRole('admin'), getInventory);
router.get('/low-stock', authenticateToken, requireRole('admin'), getLowStockProducts);
router.put('/:productId', authenticateToken, requireRole('admin'), updateStock);
router.post('/bulk-update', authenticateToken, requireRole('admin'), bulkUpdateStock);

export default router;
