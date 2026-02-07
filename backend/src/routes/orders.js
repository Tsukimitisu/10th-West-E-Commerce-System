import express from 'express';
import {
  getAllOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  createOrder,
  getOrderInvoice
} from '../controllers/orderController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Customer routes
router.get('/my-orders', authenticateToken, getUserOrders);
router.get('/:id', authenticateToken, getOrderById);
router.get('/:id/invoice', authenticateToken, getOrderInvoice);
router.post('/', authenticateToken, createOrder);

// Admin routes
router.get('/', authenticateToken, requireRole('admin'), getAllOrders);
router.put('/:id/status', authenticateToken, requireRole('admin'), updateOrderStatus);

export default router;
