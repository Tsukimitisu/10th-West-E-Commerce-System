import express from 'express';
import { sendOrderConfirmation, sendOrderStatusUpdate } from '../controllers/emailController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/order-confirmation', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), sendOrderConfirmation);
router.post('/order-status-update', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), sendOrderStatusUpdate);

export default router;
