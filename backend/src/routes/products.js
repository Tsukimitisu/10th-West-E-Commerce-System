import express from 'express';
import { body } from 'express-validator';
import {
  getProducts,
  getProductById,
  getTopSellers,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  uploadProductVideo
} from '../controllers/productController.js';
import { getProductReviews } from '../controllers/reviewController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

// Validation rules for product creation/update
const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  body('status').optional().isIn(['available', 'hidden', 'out_of_stock']).withMessage('Invalid product status'),
  body('image_urls').optional().isArray({ max: 9 }).withMessage('image_urls can contain up to 9 images'),
  body('video_url').optional({ nullable: true }).isURL().withMessage('video_url must be a valid URL')
];

const productUpdateValidation = [
  body('status').optional().isIn(['available', 'hidden', 'out_of_stock']).withMessage('Invalid product status'),
  body('image_urls').optional().isArray({ max: 9 }).withMessage('image_urls can contain up to 9 images'),
  body('video_url').optional({ nullable: true }).isURL().withMessage('video_url must be a valid URL')
];

// Public routes
router.get('/', getProducts);
router.get('/top-sellers', getTopSellers);
router.post(
  '/upload-image',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  express.raw({ type: 'image/*', limit: '5mb' }),
  uploadProductImage
);
router.post(
  '/upload-video',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  express.raw({ type: 'video/*', limit: '20mb' }),
  uploadProductVideo
);
router.get('/:id/reviews', getProductReviews);
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
  productUpdateValidation,
  validate,
  updateProduct
);

router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  deleteProduct
);

export default router;
