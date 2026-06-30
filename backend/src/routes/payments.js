import express from 'express';
import {
  createCheckout,
  expirePaymentSession,
  getPaymentReconciliation,
  getPaymentStatus,
  handlePaymongoWebhook,
  retryPayment,
} from '../controllers/secureCheckoutController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/paymongo/checkout', authenticateToken, (req, res, next) => {
  req.body = { ...req.body, payment_method: 'gcash' };
  return createCheckout(req, res, next);
});
router.post('/gcash/checkout', authenticateToken, (req, res, next) => {
  req.body = { ...req.body, payment_method: 'gcash' };
  return createCheckout(req, res, next);
});
router.post('/paymongo/webhook', handlePaymongoWebhook);
router.post('/:orderId/retry', authenticateToken, retryPayment);
router.post('/:orderId/expire', authenticateToken, expirePaymentSession);
router.get('/:orderId/reconciliation', authenticateToken, getPaymentReconciliation);
router.get('/:orderId/status', authenticateToken, getPaymentStatus);
router.get('/orders/:orderId/status', authenticateToken, getPaymentStatus);

export default router;
