import express from 'express';
import {
  createPaymentIntent,
  verifyPayment,
  getPublishableKey
} from '../controllers/checkoutController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Payment routes - can be used by authenticated or guest users
router.get('/config', getPublishableKey);
router.post('/create-payment-intent', createPaymentIntent);
router.post('/verify-payment', verifyPayment);

export default router;
