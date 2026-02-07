import express from 'express';
import {
  getSalesReport,
  getSalesByChannel,
  getStockLevelsReport,
  getTopProducts,
  getDailySalesTrend,
  getProfitReport
} from '../controllers/reportsController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All report routes require admin authentication
router.get('/sales', authenticateToken, requireRole('admin'), getSalesReport);
router.get('/sales-by-channel', authenticateToken, requireRole('admin'), getSalesByChannel);
router.get('/stock-levels', authenticateToken, requireRole('admin'), getStockLevelsReport);
router.get('/top-products', authenticateToken, requireRole('admin'), getTopProducts);
router.get('/daily-trend', authenticateToken, requireRole('admin'), getDailySalesTrend);
router.get('/profit', authenticateToken, requireRole('admin'), getProfitReport);

export default router;
