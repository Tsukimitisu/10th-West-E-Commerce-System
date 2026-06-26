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
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { createCheckout } from '../controllers/secureCheckoutController.js';
import { cancelOrderSecure, getOrderTimeline, updateOrderStatusSecure } from '../controllers/orderWorkflowController.js';

const router = express.Router();

// Customer routes
router.get('/my-orders', authenticateToken, getUserOrders);
router.get('/:id/timeline', authenticateToken, getOrderTimeline);
router.get('/:id', authenticateToken, getOrderById);
router.get('/:id/invoice', authenticateToken, getOrderInvoice);
router.post('/', authenticateToken, (req, res, next) => {
  req.body = { ...req.body, payment_method: 'cod' };
  return createCheckout(req, res, next);
});
router.post('/:id/cancel', authenticateToken, cancelOrderSecure);
router.put('/:id/cancel', authenticateToken, cancelOrderSecure);
router.put('/:id/confirm-receipt', authenticateToken, confirmOrderReceipt);

// Admin routes
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getAllOrders);
router.patch('/:id/status', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('orders.edit'), updateOrderStatusSecure);
router.put('/:id/status', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('orders.edit'), updateOrderStatusSecure);
router.put('/:id/confirm-delivery', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), confirmOrderDelivery);
router.post('/:id/jnt-waybill', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), createJntWaybill);
router.get('/:id/waybill', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getOrderWaybill);
router.get('/:id/jnt-tracking', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), refreshJntTracking);

export default router;
