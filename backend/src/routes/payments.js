import express from 'express';
import {
  createGcashCheckout,
  getPaymentOrderStatus,
  handlePaymongoWebhook,
} from '../controllers/paymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/gcash/checkout', authenticateToken, createGcashCheckout);
router.post('/paymongo/webhook', handlePaymongoWebhook);
router.get('/orders/:orderId/status', authenticateToken, getPaymentOrderStatus);

export default router;

