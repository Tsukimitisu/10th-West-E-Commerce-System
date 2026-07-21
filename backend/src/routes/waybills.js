import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { generateWaybill, getWaybill, printWaybill, reprintWaybill } from '../controllers/shipmentController.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const router = express.Router();
router.use(authenticateToken, requireRole(...STAFF_ROLES));
router.get('/:orderId', requirePermission('waybills.view'), getWaybill);
router.post('/:orderId/generate', requirePermission('waybills.generate'), generateWaybill);
router.get('/:orderId/print', requirePermission('waybills.view'), printWaybill);
router.post('/:orderId/reprint', requirePermission('waybills.generate'), reprintWaybill);
export default router;
