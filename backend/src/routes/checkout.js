import express from 'express';
import { createCheckout } from '../controllers/secureCheckoutController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticateToken, createCheckout);

export default router;
