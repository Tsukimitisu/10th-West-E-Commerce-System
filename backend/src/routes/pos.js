import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { createPosOrder } from '../controllers/posController.js';

const router=express.Router();
router.post('/orders',authenticateToken,requireRole('admin','super_admin','owner','store_staff','cashier'),requirePermission('pos.access'),createPosOrder);
export default router;
