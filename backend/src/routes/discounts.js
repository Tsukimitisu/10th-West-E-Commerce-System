import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { validateDiscount } from '../controllers/secureCheckoutController.js';
import { createPromotion, deletePromotion, listPromotions, updatePromotion } from '../controllers/discountController.js';

const router = express.Router();
router.post('/validate', authenticateToken, validateDiscount);
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('promotions.manage'), listPromotions);
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('promotions.manage'), createPromotion);
router.patch('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('promotions.manage'), updatePromotion);
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('promotions.manage'), deletePromotion);
export default router;
