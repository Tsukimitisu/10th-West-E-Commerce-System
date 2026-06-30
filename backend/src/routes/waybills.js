import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { generateWaybill, getWaybill, printWaybill, reprintWaybill } from '../controllers/shipmentController.js';

const router = express.Router();
router.use(authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'));
router.get('/:orderId', requirePermission('waybills.view'), getWaybill);
router.post('/:orderId/generate', requirePermission('waybills.generate'), generateWaybill);
router.get('/:orderId/print', requirePermission('waybills.view'), printWaybill);
router.post('/:orderId/reprint', requirePermission('waybills.generate'), reprintWaybill);
export default router;
