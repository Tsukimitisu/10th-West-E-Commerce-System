import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { bookShipment, getTracking, shipmentWebhook } from '../controllers/shipmentController.js';

const router = express.Router();
router.post('/webhook', shipmentWebhook);
router.post('/book', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('shipments.manage'), bookShipment);
router.get('/:orderId/tracking', authenticateToken, getTracking);
export default router;
