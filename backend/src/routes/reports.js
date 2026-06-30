import express from 'express';
import {
  getSalesReport,
  getSalesByChannel,
  getStockLevelsReport,
  getTopProducts,
  getDailySalesTrend,
  getProfitReport,
  getPosSalesReport,
  getReturnRefundReport
} from '../controllers/reportsController.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All report routes require admin, super_admin, or owner authentication
router.use(authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('reports.view'));
router.get('/sales', getSalesReport);
router.get('/sales-by-channel', getSalesByChannel);
router.get('/stock-levels', getStockLevelsReport);
router.get('/top-products', getTopProducts);
router.get('/daily-trend', getDailySalesTrend);
router.get('/profit', getProfitReport);
router.get('/pos', getPosSalesReport);
router.get('/returns-refunds', getReturnRefundReport);

export default router;
