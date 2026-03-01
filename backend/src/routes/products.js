import express from 'express';
import { body } from 'express-validator';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/productController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

// Validation rules for product creation/update
const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category_id').optional().isInt().withMessage('Category ID must be an integer')
];

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Protected routes (Admin, Super Admin, Owner)
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  productValidation,
  validate,
  createProduct
);

router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  updateProduct
);

router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  deleteProduct
);

export default router;
