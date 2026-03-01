import express from 'express';
import { body } from 'express-validator';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Category name is required')
];

// Public routes
router.get('/', getCategories);

// Protected routes (Admin, Super Admin, Owner)
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  categoryValidation,
  validate,
  createCategory
);

router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  categoryValidation,
  validate,
  updateCategory
);

router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  deleteCategory
);

export default router;
