import express from 'express';
import { authenticateToken, requirePermission, requirePermissionForRoles, requireRole } from '../middleware/auth.js';
import { bookShipment, cancelShipment, getShipmentDetail, getTracking, shipmentWebhook } from '../controllers/shipmentController.js';

const router = express.Router();
router.post('/webhook', shipmentWebhook);
router.post('/book', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('shipments.manage'), bookShipment);
router.get('/:orderId/tracking', authenticateToken, requirePermissionForRoles('shipments.view', 'admin', 'super_admin', 'owner', 'store_staff'), getTracking);
router.get('/:orderId', authenticateToken, requirePermissionForRoles('shipments.view', 'admin', 'super_admin', 'owner', 'store_staff'), getShipmentDetail);
router.post('/:orderId/cancel', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('shipments.manage'), cancelShipment);
export default router;
