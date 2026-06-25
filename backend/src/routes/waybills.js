import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { generateWaybill, printWaybill } from '../controllers/shipmentController.js';

const router = express.Router();
router.use(authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('waybills.manage'));
router.post('/:orderId/generate', generateWaybill);
router.get('/:orderId/print', printWaybill);
export default router;
