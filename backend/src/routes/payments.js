import express from 'express';
import {
  createCheckout,
  expirePaymentSession,
  getPaymentReconciliation,
  getPaymentStatus,
  handlePaymongoWebhook,
  retryPayment,
} from '../controllers/secureCheckoutController.js';
import { authenticateToken, requirePermissionForRoles } from '../middleware/auth.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

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
const staffPermission = (permission) => requirePermissionForRoles(permission, ...STAFF_ROLES);

router.post('/:orderId/expire', authenticateToken, staffPermission('payments.manage'), expirePaymentSession);
router.get('/:orderId/reconciliation', authenticateToken, staffPermission('payments.view'), getPaymentReconciliation);
// Ownership is enforced inside getPaymentStatus. Customers need this read-only
// endpoint after returning from hosted checkout, while staff can inspect any order.
router.get('/:orderId/status', authenticateToken, getPaymentStatus);
router.get('/orders/:orderId/status', authenticateToken, getPaymentStatus);

export default router;
