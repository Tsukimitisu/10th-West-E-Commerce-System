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

const validateBulkPricingPayload = (value) => {
  if (value === undefined || value === null || value === '') return true;

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('bulk_pricing must be a valid JSON array');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('bulk_pricing must be an array');
  }

  for (const tier of parsed) {
    if (!tier || typeof tier !== 'object') {
      throw new Error('Each bulk pricing tier must be an object');
    }

    const minQty = Number(tier.min_qty ?? tier.minQty);
    const unitPrice = Number(tier.unit_price ?? tier.unitPrice);

    if (!Number.isInteger(minQty) || minQty < 2) {
      throw new Error('Each bulk pricing tier must include min_qty as integer >= 2');
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Each bulk pricing tier must include unit_price > 0');
    }
  }

  return true;
};

const validateShippingDimensionsPayload = (value) => {
  if (value === undefined || value === null || value === '') return true;

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error('shipping_dimensions must be a valid JSON object');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('shipping_dimensions must be an object');
  }

  const rawLength = parsed.length_cm ?? parsed.length;
  const rawWidth = parsed.width_cm ?? parsed.width;
  const rawHeight = parsed.height_cm ?? parsed.height;
  const hasAnyValue = [rawLength, rawWidth, rawHeight].some(
    (rawValue) => rawValue !== undefined && rawValue !== null && rawValue !== ''
  );

  if (!hasAnyValue) return true;

  if (
    rawLength === undefined || rawLength === null || rawLength === '' ||
    rawWidth === undefined || rawWidth === null || rawWidth === '' ||
    rawHeight === undefined || rawHeight === null || rawHeight === ''
  ) {
    throw new Error('shipping_dimensions requires length, width, and height when provided');
  }

  const dimensions = [
    ['length', Number(rawLength)],
    ['width', Number(rawWidth)],
    ['height', Number(rawHeight)],
  ];

  for (const [label, parsedValue] of dimensions) {
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new Error(`shipping_dimensions ${label} must be greater than 0`);
    }
  }

  return true;
};

// Validation rules for product creation/update
const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').exists({ checkNull: true }).withMessage('Price is required').bail()
    .isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('stock_quantity').exists({ checkNull: true }).withMessage('Stock is required').bail()
    .isInt({ min: 0 }).withMessage('Stock must be an integer 0 or higher'),
  body('sale_price').optional({ nullable: true }).custom((value) => value === '' || Number(value) > 0)
    .withMessage('Sale price must be greater than 0 when provided'),
  body('sku').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('SKU must be 100 characters or less'),
  body('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be a positive integer'),
  body('status').optional().isIn(['available', 'hidden', 'out_of_stock']).withMessage('Invalid product status'),
  body('shipping_option').optional({ nullable: true }).isIn(['standard', 'express']).withMessage('shipping_option must be standard or express'),
  body('shipping_weight_kg').exists({ checkNull: true }).withMessage('Shipping weight is required').bail()
    .isFloat({ gt: 0 }).withMessage('Shipping weight must be greater than 0'),
  body('shipping_dimensions').optional({ nullable: true }).custom(validateShippingDimensionsPayload),
  body('bulk_pricing').optional({ nullable: true }).custom(validateBulkPricingPayload),
  body('image_urls').optional().isArray({ max: 9 }).withMessage('image_urls can contain up to 9 images'),
  body('video_url').optional({ nullable: true }).isURL().withMessage('video_url must be a valid URL')
];

const productUpdateValidation = [
  body('price').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('stock_quantity').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Stock must be an integer 0 or higher'),
  body('sale_price').optional({ nullable: true }).custom((value) => value === '' || Number(value) > 0)
    .withMessage('Sale price must be greater than 0 when provided'),
  body('sku').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('SKU must be 100 characters or less'),
  body('status').optional().isIn(['available', 'hidden', 'out_of_stock']).withMessage('Invalid product status'),
  body('shipping_option').optional({ nullable: true }).isIn(['standard', 'express']).withMessage('shipping_option must be standard or express'),
  body('shipping_weight_kg').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('Shipping weight must be greater than 0'),
  body('shipping_dimensions').optional({ nullable: true }).custom(validateShippingDimensionsPayload),
  body('bulk_pricing').optional({ nullable: true }).custom(validateBulkPricingPayload),
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
