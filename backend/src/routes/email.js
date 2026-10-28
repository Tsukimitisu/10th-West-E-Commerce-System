import express from 'express';
import { sendOrderConfirmation, sendOrderStatusUpdate } from '../controllers/emailController.js';
import { authenticateToken, requireRole, requirePermission } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/order-confirmation', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('orders.view'), messageLimiter, sendOrderConfirmation);
router.post('/order-status-update', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), requirePermission('orders.update'), messageLimiter, sendOrderStatusUpdate);

export default router;
