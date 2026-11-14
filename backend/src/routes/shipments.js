import express from 'express';
import { authenticateToken, requirePermission, requirePermissionForRoles, requireRole } from '../middleware/auth.js';
import {
  createManualWaybill,
  getShipmentById,
  getShipmentByOrder,
  updateManualShipmentStatus,
} from '../controllers/shipmentController.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const router = express.Router();
const staffRoles = [...STAFF_ROLES];
const customerOrShipmentViewer = requirePermissionForRoles('shipments.view', ...staffRoles);

router.post(
  '/orders/:orderId/waybill',
  authenticateToken,
  requireRole(...staffRoles),
  requirePermission('shipments.manage'),
  createManualWaybill,
);
router.get('/orders/:orderId', authenticateToken, customerOrShipmentViewer, getShipmentByOrder);
router.get('/:shipmentId', authenticateToken, customerOrShipmentViewer, getShipmentById);
router.patch(
  '/:shipmentId/status',
  authenticateToken,
  requireRole(...staffRoles),
  requirePermission('shipments.manage'),
  updateManualShipmentStatus,
);

export default router;
