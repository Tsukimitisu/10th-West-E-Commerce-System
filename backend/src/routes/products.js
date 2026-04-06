import express from 'express';
import { body, param, query } from 'express-validator';
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
import { authenticateToken, optionalAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import {
  sanitizeHttpUrlOrPath,
  sanitizePlainText,
  sanitizeRichText,
  sanitizeUrlArray,
} from '../utils/inputSanitizer.js';

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

const validateImageUrlsPayload = (value) => {
  if (value === undefined || value === null) return true;

  if (!Array.isArray(value)) {
    throw new Error('image_urls must be an array');
  }

  if (value.length > 9) {
    throw new Error('image_urls can contain up to 9 images');
  }

  value.forEach((item, index) => {
    if (!sanitizeHttpUrlOrPath(item)) {
      throw new Error(`image_urls[${index}] must be a valid URL`);
    }
  });

  return true;
};

const validateTopSellerDays = (value) => {
  if (value === undefined || value === null || value === '') return true;

  if (String(value).toLowerCase() === 'all') return true;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    throw new Error('days must be "all" or an integer between 1 and 365');
  }

  return true;
};

const productIdValidation = [
  param('id').isInt({ min: 1 }).toInt().withMessage('Product ID must be a positive integer'),
];

const productListValidation = [
  query('category').optional({ nullable: true }).isInt({ min: 1 }).toInt().withMessage('Category must be a positive integer'),
  query('search').optional({ nullable: true }).isString().isLength({ max: 120 }).withMessage('Search must be 120 characters or less')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 120 }) || ''),
  query('limit').optional({ nullable: true }).isInt({ min: 1, max: 80 }).toInt().withMessage('Limit must be between 1 and 80'),
];

const topSellersValidation = [
  query('days').optional({ nullable: true }).custom(validateTopSellerDays)
    .customSanitizer((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (String(value).toLowerCase() === 'all') return 'all';
      return Number.parseInt(String(value), 10);
    }),
  query('limit').optional({ nullable: true }).isInt({ min: 1, max: 50 }).toInt().withMessage('Limit must be between 1 and 50'),
];

// Validation rules for product creation/update
const productValidation = [
  body('name').exists({ checkNull: true }).withMessage('Product name is required').bail()
    .isString().withMessage('Product name must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 255 }) || '')
    .notEmpty().withMessage('Product name is required'),
  body('part_number').optional({ nullable: true }).isString().withMessage('Part number must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('description').optional({ nullable: true }).isString().withMessage('Description must be a string')
    .customSanitizer((value) => sanitizeRichText(value, { maxLength: 10000 }) || ''),
  body('brand').optional({ nullable: true }).isString().withMessage('Brand must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('box_number').optional({ nullable: true }).isString().withMessage('Box number must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('barcode').optional({ nullable: true }).isString().withMessage('Barcode must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('sku').optional({ nullable: true }).isString().withMessage('SKU must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('price').exists({ checkNull: true }).withMessage('Price is required').bail()
    .isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('stock_quantity').exists({ checkNull: true }).withMessage('Stock is required').bail()
    .isInt({ min: 0 }).withMessage('Stock must be an integer 0 or higher'),
  body('sale_price').optional({ nullable: true }).custom((value) => value === '' || Number(value) > 0)
    .withMessage('Sale price must be greater than 0 when provided'),
  body('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be a positive integer'),
  body('status').optional().isIn(['draft', 'published']).withMessage('Invalid product status'),
  body('shipping_option').optional({ nullable: true }).isIn(['standard', 'express']).withMessage('shipping_option must be standard or express'),
  body('shipping_weight_kg').exists({ checkNull: true }).withMessage('Shipping weight is required').bail()
    .isFloat({ gt: 0 }).withMessage('Shipping weight must be greater than 0'),
  body('image').optional({ nullable: true }).custom((value) => value === '' || sanitizeHttpUrlOrPath(value) !== null)
    .withMessage('image must be a valid URL')
    .customSanitizer((value) => sanitizeHttpUrlOrPath(value)),
  body('shipping_dimensions').optional({ nullable: true }).custom(validateShippingDimensionsPayload),
  body('auto_generate_sku').optional({ nullable: true }).isBoolean().withMessage('auto_generate_sku must be true or false'),
  body('bulk_pricing').optional({ nullable: true }).custom(validateBulkPricingPayload),
  body('image_urls').optional({ nullable: true }).custom(validateImageUrlsPayload)
    .customSanitizer((value) => sanitizeUrlArray(value, { maxItems: 9 })),
  body('video_url').optional({ nullable: true }).custom((value) => value === '' || sanitizeHttpUrlOrPath(value) !== null)
    .withMessage('video_url must be a valid URL')
    .customSanitizer((value) => sanitizeHttpUrlOrPath(value)),
];

const productUpdateValidation = [
  body('name').optional({ nullable: true }).isString().withMessage('Product name must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 255 }) || ''),
  body('part_number').optional({ nullable: true }).isString().withMessage('Part number must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('description').optional({ nullable: true }).isString().withMessage('Description must be a string')
    .customSanitizer((value) => sanitizeRichText(value, { maxLength: 10000 }) || ''),
  body('brand').optional({ nullable: true }).isString().withMessage('Brand must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('box_number').optional({ nullable: true }).isString().withMessage('Box number must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('barcode').optional({ nullable: true }).isString().withMessage('Barcode must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('sku').optional({ nullable: true }).isString().withMessage('SKU must be a string')
    .customSanitizer((value) => sanitizePlainText(value, { maxLength: 100 }) || ''),
  body('price').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('stock_quantity').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Stock must be an integer 0 or higher'),
  body('sale_price').optional({ nullable: true }).custom((value) => value === '' || Number(value) > 0)
    .withMessage('Sale price must be greater than 0 when provided'),
  body('status').optional().isIn(['draft', 'published']).withMessage('Invalid product status'),
  body('shipping_option').optional({ nullable: true }).isIn(['standard', 'express']).withMessage('shipping_option must be standard or express'),
  body('shipping_weight_kg').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('Shipping weight must be greater than 0'),
  body('image').optional({ nullable: true }).custom((value) => value === '' || sanitizeHttpUrlOrPath(value) !== null)
    .withMessage('image must be a valid URL')
    .customSanitizer((value) => sanitizeHttpUrlOrPath(value)),
  body('shipping_dimensions').optional({ nullable: true }).custom(validateShippingDimensionsPayload),
  body('auto_generate_sku').optional({ nullable: true }).isBoolean().withMessage('auto_generate_sku must be true or false'),
  body('bulk_pricing').optional({ nullable: true }).custom(validateBulkPricingPayload),
  body('image_urls').optional({ nullable: true }).custom(validateImageUrlsPayload)
    .customSanitizer((value) => sanitizeUrlArray(value, { maxItems: 9 })),
  body('video_url').optional({ nullable: true }).custom((value) => value === '' || sanitizeHttpUrlOrPath(value) !== null)
    .withMessage('video_url must be a valid URL')
    .customSanitizer((value) => sanitizeHttpUrlOrPath(value)),
];

// Public routes
router.get('/', optionalAuth, productListValidation, validate, getProducts);
router.get('/top-sellers', optionalAuth, topSellersValidation, validate, getTopSellers);
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
router.get('/:id/reviews', productIdValidation, validate, getProductReviews);
router.get('/:id', optionalAuth, productIdValidation, validate, getProductById);

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
  productIdValidation,
  productUpdateValidation,
  validate,
  updateProduct
);

router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner'),
  productIdValidation,
  validate,
  deleteProduct
);

export default router;
