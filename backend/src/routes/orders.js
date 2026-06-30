import express from 'express';
import {
  getAllOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  confirmOrderDelivery,
  confirmOrderReceipt,
  createOrder,
  getOrderInvoice,
  cancelOrder,
  createJntWaybill,
  getOrderWaybill,
  refreshJntTracking
} from '../controllers/orderController.js';
import { authenticateToken, requirePermission, requirePermissionForRoles, requireRole } from '../middleware/auth.js';
import { createCheckout } from '../controllers/secureCheckoutController.js';
import { cancelOrderSecure, getOrderTimeline, updateOrderStatusSecure } from '../controllers/orderWorkflowController.js';

const router = express.Router();

// Customer routes
router.get('/my-orders', authenticateToken, getUserOrders);
const operationsRoles = ['admin', 'super_admin', 'owner', 'store_staff'];
const operationsPermission = (permission) => requirePermissionForRoles(permission, ...operationsRoles);

router.get('/:id/timeline', authenticateToken, operationsPermission('orders.view'), getOrderTimeline);
router.get('/:id', authenticateToken, operationsPermission('orders.view'), getOrderById);
router.get('/:id/invoice', authenticateToken, operationsPermission('orders.view'), getOrderInvoice);
router.post('/', authenticateToken, (req, res, next) => {
  req.body = { ...req.body, payment_method: 'cod' };
  return createCheckout(req, res, next);
});
router.post('/:id/cancel', authenticateToken, operationsPermission('orders.cancel'), cancelOrderSecure);
router.put('/:id/cancel', authenticateToken, operationsPermission('orders.cancel'), cancelOrderSecure);
router.put('/:id/confirm-receipt', authenticateToken, confirmOrderReceipt);

// Admin routes
router.get('/', authenticateToken, requireRole(...operationsRoles), requirePermission('orders.view'), getAllOrders);
router.patch('/:id/status', authenticateToken, requireRole(...operationsRoles), requirePermission('orders.update'), updateOrderStatusSecure);
router.put('/:id/status', authenticateToken, requireRole(...operationsRoles), requirePermission('orders.update'), updateOrderStatusSecure);
router.put('/:id/confirm-delivery', authenticateToken, requireRole(...operationsRoles), requirePermission('orders.update'), confirmOrderDelivery);
router.post('/:id/jnt-waybill', authenticateToken, requireRole(...operationsRoles), requirePermission('waybills.generate'), createJntWaybill);
router.get('/:id/waybill', authenticateToken, requireRole(...operationsRoles), requirePermission('waybills.view'), getOrderWaybill);
router.get('/:id/jnt-tracking', authenticateToken, requireRole(...operationsRoles), requirePermission('shipments.view'), refreshJntTracking);

export default router;
