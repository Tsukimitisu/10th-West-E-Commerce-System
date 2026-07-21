import express from 'express';
import { authenticateToken, requirePermission, requirePermissionForRoles, requireRole } from '../middleware/auth.js';
import {
  bookShipment,
  calculateRates,
  cancelShipment,
  getShipmentDetail,
  getTracking,
  refreshTracking,
  shipmentWebhook,
} from '../controllers/shipmentController.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const router = express.Router();
const staffRoles = [...STAFF_ROLES];
router.post('/webhook', shipmentWebhook);
router.post('/rates', authenticateToken, requireRole(...staffRoles), requirePermission('shipments.manage'), calculateRates);
router.post('/book', authenticateToken, requireRole(...staffRoles), requirePermission('shipments.manage'), bookShipment);
router.get('/:orderId/tracking', authenticateToken, requirePermissionForRoles('shipments.view', ...staffRoles), getTracking);
router.post('/:orderId/tracking/refresh', authenticateToken, requireRole(...staffRoles), requirePermission('tracking.refresh'), refreshTracking);
router.get('/:orderId', authenticateToken, requirePermissionForRoles('shipments.view', ...staffRoles), getShipmentDetail);
router.post('/:orderId/cancel', authenticateToken, requireRole(...staffRoles), requirePermission('shipments.manage'), cancelShipment);
export default router;
