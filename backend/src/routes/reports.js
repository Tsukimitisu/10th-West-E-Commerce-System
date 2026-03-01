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

// All report routes require admin, super_admin, or owner authentication
router.get('/sales', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getSalesReport);
router.get('/sales-by-channel', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getSalesByChannel);
router.get('/stock-levels', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getStockLevelsReport);
router.get('/top-products', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getTopProducts);
router.get('/daily-trend', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getDailySalesTrend);
router.get('/profit', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getProfitReport);

export default router;
