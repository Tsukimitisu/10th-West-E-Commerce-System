import express from 'express';
import { sendOrderConfirmation, sendOrderStatusUpdate } from '../controllers/emailController.js';

const router = express.Router();

router.post('/order-confirmation', sendOrderConfirmation);
router.post('/order-status-update', sendOrderStatusUpdate);

export default router;
