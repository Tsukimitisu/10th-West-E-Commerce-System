import express from 'express';
import {
  getAllOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  createOrder,
  getOrderInvoice,
  cancelOrder
} from '../controllers/orderController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Customer routes
router.get('/my-orders', authenticateToken, getUserOrders);
router.get('/:id', authenticateToken, getOrderById);
router.get('/:id/invoice', authenticateToken, getOrderInvoice);
router.post('/', authenticateToken, createOrder);
router.put('/:id/cancel', authenticateToken, cancelOrder);

// Admin routes
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), getAllOrders);
router.put('/:id/status', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), updateOrderStatus);

export default router;
