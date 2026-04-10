import pool from '../config/database.js';
import { emitProductCreated, emitProductUpdated, emitProductDeleted } from '../socket.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../services/cloudinary.js';
import {
  sanitizeHttpUrlOrPath,
  sanitizePlainText,
  sanitizeRichText,
  sanitizeUrlArray,
} from '../utils/inputSanitizer.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v']);
const ALLOWED_PRODUCT_STATUSES = new Set(['draft', 'published']);
const ALLOWED_PRODUCT_SHIPPING_OPTIONS = new Set(['standard', 'express']);
const PRODUCT_PUBLISHER_ROLES = new Set(['admin', 'super_admin', 'owner']);
const PRODUCT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const SKU_MAX_GENERATION_ATTEMPTS = 10;
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogg',
  'video/x-m4v': 'm4v'
};

const toNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toNullableBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
};

const parseRequiredPositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseRequiredNonNegativeInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

const parseOptionalNumberField = (value) => {
  if (value === undefined || value === null || value === '') {
    return {
      provided: false,
      valid: true,
      value: null,
    };
  }

  const parsed = Number(value);
  return {
    provided: true,
    valid: Number.isFinite(parsed),
    value: Number.isFinite(parsed) ? parsed : null,
  };
};

const parseOptionalIntegerField = (value) => {
  if (value === undefined || value === null || value === '') {
    return {
      provided: false,
      valid: true,
      value: null,
    };
  }

  const parsed = Number(value);
  return {
    provided: true,
    valid: Number.isInteger(parsed),
    value: Number.isInteger(parsed) ? parsed : null,
  };
};

const toNullableShippingOption = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return ALLOWED_PRODUCT_SHIPPING_OPTIONS.has(normalized) ? normalized : null;
};

const parseOptionalShippingDimensionsField = (value) => {
  if (value === undefined) {
    return {
      provided: false,
      valid: true,
      value: null,
    };
  }

  if (value === null || value === '') {
    return {
      provided: true,
      valid: true,
      value: null,
    };
  }

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {
        provided: true,
        valid: false,
        value: null,
        error: 'Shipping dimensions must be a valid JSON object.',
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      provided: true,
      valid: false,
      value: null,
      error: 'Shipping dimensions must be an object with length, width, and height.',
    };
  }

  const rawLength = parsed.length_cm ?? parsed.length;
  const rawWidth = parsed.width_cm ?? parsed.width;
  const rawHeight = parsed.height_cm ?? parsed.height;
  const hasAnyValue = [rawLength, rawWidth, rawHeight].some(
    (rawValue) => rawValue !== undefined && rawValue !== null && rawValue !== ''
  );

  if (!hasAnyValue) {
    return {
      provided: true,
      valid: true,
      value: null,
    };
  }

  if (
    rawLength === undefined || rawLength === null || rawLength === '' ||
    rawWidth === undefined || rawWidth === null || rawWidth === '' ||
    rawHeight === undefined || rawHeight === null || rawHeight === ''
  ) {
    return {
      provided: true,
      valid: false,
      value: null,
      error: 'Shipping dimensions require length, width, and height when provided.',
    };
  }

  const lengthCm = Number(rawLength);
  const widthCm = Number(rawWidth);
  const heightCm = Number(rawHeight);

  if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
    return {
      provided: true,
      valid: false,
      value: null,
      error: 'Shipping dimension length must be greater than 0.',
    };
  }

  if (!Number.isFinite(widthCm) || widthCm <= 0) {
    return {
      provided: true,
      valid: false,
      value: null,
      error: 'Shipping dimension width must be greater than 0.',
    };
  }

  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    return {
      provided: true,
      valid: false,
      value: null,
      error: 'Shipping dimension height must be greater than 0.',
    };
  }

  return {
    provided: true,
    valid: true,
    value: {
      length_cm: Number(lengthCm.toFixed(2)),
      width_cm: Number(widthCm.toFixed(2)),
      height_cm: Number(heightCm.toFixed(2)),
      unit: 'cm',
    },
  };
};

const hasBodyField = (body, field) => Object.prototype.hasOwnProperty.call(body || {}, field);

const normalizeSkuToken = (value, fallback = 'SKU') => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22);

  return normalized || fallback;
};

const buildSkuBase = ({ partNumber, name }) => {
  const partToken = normalizeSkuToken(partNumber, '');
  if (partToken) return partToken;

  const nameToken = normalizeSkuToken(name, '');
  if (nameToken) return nameToken;

  return 'SKU';
};

const randomSkuSuffix = () => Math.random().toString(36).slice(2, 7).toUpperCase();

const validateAndNormalizeBulkPricing = (value, regularPrice) => {
  if (value === undefined) return { value: undefined };

  if (value === null || value === '') return { value: [] };

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { error: 'Bulk pricing must be a valid JSON array.' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: 'Bulk pricing must be an array of tiers.' };
  }

  const normalized = [];
  const seenMinQty = new Set();

  for (let index = 0; index < parsed.length; index += 1) {
    const tier = parsed[index];
    if (!tier || typeof tier !== 'object') {
      return { error: `Bulk pricing row ${index + 1} is invalid.` };
    }

    const minQtyRaw = tier.min_qty ?? tier.minQty;
    const unitPriceRaw = tier.unit_price ?? tier.unitPrice;
    const minQty = Number(minQtyRaw);
    const unitPrice = Number(unitPriceRaw);

    if (!Number.isInteger(minQty) || minQty < 2) {
      return { error: `Bulk pricing row ${index + 1}: minimum quantity must be an integer of 2 or more.` };
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { error: `Bulk pricing row ${index + 1}: unit price must be greater than 0.` };
    }

    if (seenMinQty.has(minQty)) {
      return { error: `Bulk pricing row ${index + 1}: duplicate minimum quantity ${minQty}.` };
    }

    if (Number.isFinite(regularPrice) && unitPrice >= regularPrice) {
      return { error: `Bulk pricing row ${index + 1}: unit price must be lower than regular price.` };
    }

    seenMinQty.add(minQty);
    normalized.push({ min_qty: minQty, unit_price: unitPrice });
  }

  normalized.sort((a, b) => a.min_qty - b.min_qty);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].unit_price > normalized[index - 1].unit_price) {
      return { error: 'Bulk pricing unit price must stay the same or decrease as quantity increases.' };
    }
  }

  return { value: normalized };
};

const skuExists = async (sku, excludeProductId = null) => {
  const result = await pool.query(
    `SELECT 1
     FROM products
     WHERE sku = $1
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [sku, excludeProductId]
  );

  return result.rows.length > 0;
};

const generateUniqueSku = async ({ partNumber, name, excludeProductId = null }) => {
  const base = buildSkuBase({ partNumber, name });

  for (let attempt = 0; attempt < SKU_MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = `${base}-${randomSkuSuffix()}`;
    const exists = await skuExists(candidate, excludeProductId);
    if (!exists) return candidate;
  }

  const fallback = `${base}-${Date.now().toString(36).toUpperCase()}`;
  return fallback.slice(0, 100);
};

const toNullableProductStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return ALLOWED_PRODUCT_STATUSES.has(normalized) ? normalized : null;
};

const canViewUnpublishedProducts = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  return PRODUCT_PUBLISHER_ROLES.has(role);
};

const requireProductManagerAccess = (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }

  if (!canViewUnpublishedProducts(req.user)) {
    res.status(403).json({ message: 'Insufficient permissions' });
    return false;
  }

  return true;
};

const normalizeProductImageUrls = (value) => {
  if (!value) return [];

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value
        .split(/[\n,|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(parsed)) return [];

  return Array.from(new Set(
    parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )).slice(0, 9);
};

const tokenizeSearchTerms = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim();

  if (!normalized) return [];

  const seen = new Set();
  const terms = [];
  normalized.split(/\s+/).forEach((term) => {
    if (!term || term.length < 2 || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms.slice(0, 8);
};

const normalizeSearchPhrase = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const parseResultLimit = (value, fallback = null, max = 80) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  return Math.min(parsed, max);
};

const normalizeVariantToken = (value, fallback = 'x') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
};

const buildVariantCombinationKey = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${normalizeVariantToken(optionName, 'opt')}:${normalizeVariantToken(optionCombination?.[optionName], 'val')}`)
  .join('|');

const normalizeStoredVariantOptions = (value) => {
  if (!Array.isArray(value)) return [];

  const optionNameSet = new Set();
  const options = [];

  value.forEach((option) => {
    const name = String(option?.name || '').trim();
    if (!name) return;

    const nameToken = name.toLowerCase();
    if (optionNameSet.has(nameToken)) return;

    optionNameSet.add(nameToken);

    const seenValues = new Set();
    const values = (Array.isArray(option?.values) ? option.values : [])
      .map((rawValue) => String(rawValue || '').trim())
      .filter(Boolean)
      .filter((rawValue) => {
        const valueToken = rawValue.toLowerCase();
        if (seenValues.has(valueToken)) return false;
        seenValues.add(valueToken);
        return true;
      })
      .slice(0, 30);

    if (values.length === 0) return;

    options.push({ name, values });
  });

  return options;
};

const deriveVariantOptionsFromRows = (rows = []) => {
  const optionValues = new Map();
  const optionOrder = [];

  rows.forEach((row) => {
    const combination = row?.option_combination;
    if (!combination || typeof combination !== 'object' || Array.isArray(combination)) return;

    Object.entries(combination).forEach(([rawName, rawValue]) => {
      const optionName = String(rawName || '').trim();
      const optionValue = String(rawValue || '').trim();
      if (!optionName || !optionValue) return;

      if (!optionValues.has(optionName)) {
        optionValues.set(optionName, []);
        optionOrder.push(optionName);
      }

      const values = optionValues.get(optionName);
      if (!values.includes(optionValue)) {
        values.push(optionValue);
      }
    });
  });

  return optionOrder.map((name) => ({ name, values: optionValues.get(name) || [] }));
};

const ensureProductSchema = async () => {
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS video_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS bulk_pricing JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS shipping_option VARCHAR(20) DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS shipping_weight_kg DECIMAL(10, 3),
      ADD COLUMN IF NOT EXISTS shipping_dimensions JSONB;
  `).catch((error) => {
    console.error('Failed to ensure product media columns:', error);
  });

  await pool.query(`
    UPDATE products
    SET status = 'draft'
    WHERE status = 'hidden';

    UPDATE products
    SET status = 'published'
    WHERE status IN ('available', 'out_of_stock');

    UPDATE products
    SET status = 'draft'
    WHERE status IS NULL;

    ALTER TABLE products
    ALTER COLUMN status SET DEFAULT 'draft';

    ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_status_check;

    ALTER TABLE products
    ADD CONSTRAINT products_status_check
      CHECK (status IN ('draft', 'published'));

    UPDATE products
    SET shipping_option = 'standard'
    WHERE shipping_option IS NULL;

    UPDATE products
    SET shipping_weight_kg = 0.10
    WHERE shipping_weight_kg IS NULL;

    ALTER TABLE products
    ALTER COLUMN shipping_weight_kg SET DEFAULT 0.10;
  `).catch((error) => {
    console.error('Failed to ensure product shipping defaults:', error);
  });

  await pool.query(`
    ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS option_combination JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS combination_key VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `).catch((error) => {
    console.error('Failed to ensure variant columns:', error);
  });
};

const ensureProductSchemaReady = ensureProductSchema().catch((error) => {
  console.error('Failed to ensure product schema:', error);
});

// Get all products
export const getProducts = async (req, res) => {
  try {
    const { category, search, limit: limitParam } = req.validatedData || req.query;
    const searchTerms = tokenizeSearchTerms(search);
    const searchPhrase = normalizeSearchPhrase(search);
    const resultLimit = parseResultLimit(limitParam, null, 80);
    const includeUnpublished = canViewUnpublishedProducts(req.user);
    
    let selectClause = `
      SELECT p.*, c.name as category_name,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status IN ('paid', 'completed')
      ), 0) as total_sold,
      COALESCE((
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), p.rating, 0) as review_rating,
      COALESCE((
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), 0) as review_count
    `;
    let fromClause = 'FROM products p LEFT JOIN categories c ON p.category_id = c.id';
    let whereClause = 'WHERE 1=1';
    let orderByClause = '';
    const params = [];

    if (!includeUnpublished) {
      params.push('published');
      whereClause += ` AND p.status = $${params.length}`;
    }

    // Filter by category
    if (category) {
      params.push(category);
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    // Search by name and keyword/tag-style terms (e.g. "helmet, #modular")
    if (searchTerms.length > 0) {
      let relevanceScores = [];

      searchTerms.forEach((term) => {
        params.push(`%${term}%`);
        const containsIdx = params.length;
        params.push(`${term}%`);
        const prefixIdx = params.length;
        params.push(term);
        const exactIdx = params.length;
        
        whereClause += ` AND (
          p.name ILIKE $${containsIdx} OR 
          p.part_number ILIKE $${containsIdx} OR 
          p.description ILIKE $${containsIdx} OR 
          p.brand ILIKE $${containsIdx} OR 
          p.sku ILIKE $${containsIdx} OR 
          c.name ILIKE $${containsIdx}
        )`;

        relevanceScores.push(`
          (CASE WHEN LOWER(p.name) = $${exactIdx} THEN 160 ELSE 0 END) +
          (CASE WHEN LOWER(p.name) LIKE $${prefixIdx} THEN 65 ELSE 0 END) +
          (CASE WHEN p.name ILIKE $${containsIdx} THEN 35 ELSE 0 END) +
          (CASE WHEN p.part_number ILIKE $${containsIdx} THEN 28 ELSE 0 END) +
          (CASE WHEN p.sku ILIKE $${containsIdx} THEN 22 ELSE 0 END) +
          (CASE WHEN p.brand ILIKE $${containsIdx} THEN 16 ELSE 0 END) +
          (CASE WHEN c.name ILIKE $${containsIdx} THEN 12 ELSE 0 END) +
          (CASE WHEN p.description ILIKE $${containsIdx} THEN 7 ELSE 0 END)
        `);
      });

      if (searchPhrase) {
        params.push(`%${searchPhrase}%`);
        const phraseContainsIdx = params.length;
        params.push(`${searchPhrase}%`);
        const phrasePrefixIdx = params.length;
        relevanceScores.push(`
          (CASE WHEN LOWER(p.name) LIKE $${phrasePrefixIdx} THEN 120 ELSE 0 END) +
          (CASE WHEN LOWER(p.name) LIKE $${phraseContainsIdx} THEN 70 ELSE 0 END) +
          (CASE WHEN LOWER(p.description) LIKE $${phraseContainsIdx} THEN 24 ELSE 0 END)
        `);
      }

      selectClause += `, (${relevanceScores.join(' + ')}) as relevance_score`;
      orderByClause = 'ORDER BY relevance_score DESC, p.id DESC';
    } else {
      orderByClause = 'ORDER BY p.id DESC';
    }

    if (resultLimit) {
      params.push(resultLimit);
      orderByClause += ` LIMIT $${params.length}`;
    }

    const query = `${selectClause} ${fromClause} ${whereClause} ${orderByClause}`;
    const result = await pool.query(query, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
      price: parseFloat(product.price),
      buying_price: parseFloat(product.buying_price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      shipping_option: toNullableShippingOption(product.shipping_option) || 'standard',
      shipping_weight_kg: product.shipping_weight_kg !== null ? parseFloat(product.shipping_weight_kg) : null,
      stock_quantity: parseInt(product.stock_quantity),
      total_sold: parseInt(product.total_sold)
    })));
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get top selling products
export const getTopSellers = async (req, res) => {
  try {
    const { days, limit = 8 } = req.validatedData || req.query;
    const includeUnpublished = canViewUnpublishedProducts(req.user);

    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 8;

    const params = [safeLimit];
    let whereClause = `WHERE o.status = 'completed'`;

    if (!includeUnpublished) {
      whereClause += ` AND p.status = 'published'`;
    }

    if (days && days !== 'all') {
      const parsedDays = Number.parseInt(String(days), 10);
      if (Number.isFinite(parsedDays) && parsedDays > 0) {
        params.push(parsedDays);
        whereClause += ` AND o.created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`;
      }
    }

    // We MUST manually list columns instead of p.* because PostgreSQL strict GROUP BY
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, p.part_number, p.image, p.description, 
        p.price, p.sale_price, p.is_on_sale, p.stock_quantity, p.rating, p.created_at,
        c.name as category_name,
        COALESCE((
          SELECT ROUND(AVG(r.rating)::numeric, 1)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
        ), p.rating, 0) as review_rating,
        COALESCE((
          SELECT COUNT(*)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
        ), 0) as review_count,
        SUM(oi.quantity) as total_sold
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY total_sold DESC, p.id DESC
      LIMIT $1
    `, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
      price: parseFloat(product.price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      stock_quantity: parseInt(product.stock_quantity),
      total_sold: parseInt(product.total_sold)
    })));
  } catch (error) {
    console.error('Get top sellers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single product by ID
export const getProductById = async (req, res) => {
  try {
    await ensureProductSchemaReady;

    const { id } = req.validatedData || req.params;
    const includeUnpublished = canViewUnpublishedProducts(req.user);
    
    const result = await pool.query(
      `SELECT p.*, c.name as category_name,
              COALESCE((
                SELECT ROUND(AVG(r.rating)::numeric, 1)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
              ), p.rating, 0) as review_rating,
              COALESCE((
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
              ), 0) as review_count
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = result.rows[0];

    if (!includeUnpublished && String(product.status || '').toLowerCase() !== 'published') {
      return res.status(404).json({ message: 'Product not found' });
    }

    let variantRows = [];
    try {
      const modernVariantResult = await pool.query(
        `SELECT id, product_id, variant_type, variant_value, price_adjustment, price,
                stock_quantity, sku, image_url, option_combination, combination_key
         FROM product_variants
         WHERE product_id = $1
         ORDER BY created_at ASC, id ASC`,
        [id]
      );
      variantRows = modernVariantResult.rows;
    } catch (variantError) {
      try {
        const legacyVariantResult = await pool.query(
          `SELECT id, product_id, variant_type, variant_value, price_adjustment,
                  stock_quantity, sku
           FROM product_variants
           WHERE product_id = $1
           ORDER BY variant_type ASC, variant_value ASC`,
          [id]
        );
        variantRows = legacyVariantResult.rows;
      } catch (legacyError) {
        console.warn('Could not load product variants:', legacyError.message || variantError.message);
      }
    }

    const storedVariantOptions = normalizeStoredVariantOptions(product.variant_options);
    const optionOrder = storedVariantOptions.map((option) => option.name);
    const basePrice = Number(product.price);

    const variants = variantRows
      .map((variantRow) => {
        let optionCombination = variantRow.option_combination;

        if (!optionCombination || typeof optionCombination !== 'object' || Array.isArray(optionCombination)) {
          const fallbackOptionName = optionOrder[0] || String(variantRow.variant_type || 'Option').trim() || 'Option';
          const fallbackOptionValue = String(variantRow.variant_value || '').trim();
          optionCombination = fallbackOptionValue ? { [fallbackOptionName]: fallbackOptionValue } : {};
        }

        const normalizedCombination = {};
        const combinationOrder = optionOrder.length > 0 ? optionOrder : Object.keys(optionCombination);

        combinationOrder.forEach((optionName) => {
          const optionValue = String(optionCombination?.[optionName] || '').trim();
          if (!optionValue) return;
          normalizedCombination[optionName] = optionValue;
        });

        if (Object.keys(normalizedCombination).length === 0) {
          Object.entries(optionCombination || {}).forEach(([rawName, rawValue]) => {
            const optionName = String(rawName || '').trim();
            const optionValue = String(rawValue || '').trim();
            if (!optionName || !optionValue) return;
            normalizedCombination[optionName] = optionValue;
          });
        }

        if (Object.keys(normalizedCombination).length === 0) {
          return null;
        }

        const normalizedOrder = optionOrder.length > 0 ? optionOrder : Object.keys(normalizedCombination);
        const resolvedPrice = Number.isFinite(Number(variantRow.price))
          ? Number(variantRow.price)
          : basePrice + Number(variantRow.price_adjustment || 0);

        return {
          id: variantRow.id,
          product_id: variantRow.product_id,
          option_combination: normalizedCombination,
          combination_key: variantRow.combination_key || buildVariantCombinationKey(normalizedCombination, normalizedOrder),
          price: Number.isFinite(resolvedPrice) ? resolvedPrice : basePrice,
          stock_quantity: Number.isFinite(Number(variantRow.stock_quantity)) ? Number(variantRow.stock_quantity) : 0,
          image_url: String(variantRow.image_url || '').trim() || null,
          sku: String(variantRow.sku || '').trim() || null,
        };
      })
      .filter(Boolean);

    const variantOptions = storedVariantOptions.length > 0
      ? storedVariantOptions
      : deriveVariantOptionsFromRows(variants);

    res.json({
      ...product,
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
      price: parseFloat(product.price),
      buying_price: product.buying_price !== null ? parseFloat(product.buying_price) : null,
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      shipping_option: toNullableShippingOption(product.shipping_option) || 'standard',
      shipping_weight_kg: product.shipping_weight_kg !== null ? parseFloat(product.shipping_weight_kg) : null,
      stock_quantity: parseInt(product.stock_quantity, 10),
      variant_options: variantOptions,
      variants,
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new product (Admin only)
export const createProduct = async (req, res) => {
  const {
    part_number, name, description, price, buying_price,
    image, video_url, category_id, stock_quantity, shipping_option, shipping_weight_kg, shipping_dimensions, box_number,
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing, auto_generate_sku
  } = req.body;

  try {
    if (!requireProductManagerAccess(req, res)) return;

    const cleanName = sanitizePlainText(name, { maxLength: 255 }) || '';
    if (!cleanName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const parsedPrice = parseRequiredPositiveNumber(price);
    if (parsedPrice === null) {
      return res.status(400).json({ message: 'Price must be greater than 0' });
    }

    const parsedStockQuantity = parseRequiredNonNegativeInteger(stock_quantity);
    if (parsedStockQuantity === null) {
      return res.status(400).json({ message: 'Stock quantity must be an integer 0 or higher' });
    }

    const parsedShippingWeightKg = parseRequiredPositiveNumber(shipping_weight_kg);
    if (parsedShippingWeightKg === null) {
      return res.status(400).json({ message: 'Shipping weight (kg) is required and must be greater than 0' });
    }

    const shippingDimensionsField = parseOptionalShippingDimensionsField(shipping_dimensions);
    if (!shippingDimensionsField.valid) {
      return res.status(400).json({ message: shippingDimensionsField.error || 'Shipping dimensions are invalid' });
    }

    const buyingPriceField = parseOptionalNumberField(buying_price);
    if (!buyingPriceField.valid) {
      return res.status(400).json({ message: 'Buying price must be a valid number' });
    }
    if (buyingPriceField.value !== null && buyingPriceField.value < 0) {
      return res.status(400).json({ message: 'Buying price must be 0 or higher' });
    }

    const categoryIdField = parseOptionalIntegerField(category_id);
    if (!categoryIdField.valid) {
      return res.status(400).json({ message: 'Category must be a whole number' });
    }
    if (categoryIdField.value !== null && categoryIdField.value <= 0) {
      return res.status(400).json({ message: 'Category must be a positive integer' });
    }

    const lowStockThresholdField = parseOptionalIntegerField(low_stock_threshold);
    if (!lowStockThresholdField.valid) {
      return res.status(400).json({ message: 'Low stock threshold must be a whole number' });
    }
    if (lowStockThresholdField.value !== null && lowStockThresholdField.value < 0) {
      return res.status(400).json({ message: 'Low stock threshold must be 0 or higher' });
    }

    const salePriceField = parseOptionalNumberField(sale_price);
    if (!salePriceField.valid) {
      return res.status(400).json({ message: 'Sale price must be a valid number' });
    }

    const cleanSalePrice = salePriceField.value;
    if (cleanSalePrice !== null && cleanSalePrice <= 0) {
      return res.status(400).json({ message: 'Sale price must be greater than 0' });
    }

    if (cleanSalePrice !== null && cleanSalePrice >= parsedPrice) {
      return res.status(400).json({ message: 'Sale price must be lower than regular price' });
    }

    const bulkPricingValidation = validateAndNormalizeBulkPricing(bulk_pricing, parsedPrice);
    if (bulkPricingValidation.error) {
      return res.status(400).json({ message: bulkPricingValidation.error });
    }

    const cleanDescription = sanitizeRichText(description, { maxLength: 10000 });
    const cleanPartNumber = sanitizePlainText(part_number, { maxLength: 100 });
    const requestedAutoSku = toNullableBoolean(auto_generate_sku) === true;
    const cleanSku = sanitizePlainText(sku, { maxLength: 100 });
    const cleanBarcode = sanitizePlainText(barcode, { maxLength: 100 });
    const cleanImage = sanitizeHttpUrlOrPath(image);
    const cleanVideoUrl = sanitizeHttpUrlOrPath(video_url);
    const cleanBrand = sanitizePlainText(brand, { maxLength: 100 });
    const cleanBoxNumber = sanitizePlainText(box_number, { maxLength: 100 });
    const cleanCategoryId = categoryIdField.value;
    const cleanLowStockThreshold = lowStockThresholdField.value;
    const cleanIsOnSale = toNullableBoolean(is_on_sale);
    const cleanStatus = toNullableProductStatus(status);
    const cleanShippingOption = shipping_option === undefined
      ? 'standard'
      : toNullableShippingOption(shipping_option);
    const cleanImageUrls = Array.isArray(image_urls)
      ? sanitizeUrlArray(image_urls, { maxItems: 9 })
      : normalizeProductImageUrls(image_urls);
    const cleanBulkPricing = bulkPricingValidation.value ?? [];
    const cleanShippingDimensions = shippingDimensionsField.value;

    if (image !== undefined && image !== null && image !== '' && !cleanImage) {
      return res.status(400).json({ message: 'Image URL is invalid' });
    }

    if (video_url !== undefined && video_url !== null && video_url !== '' && !cleanVideoUrl) {
      return res.status(400).json({ message: 'Video URL is invalid' });
    }

    if (status !== undefined && cleanStatus === null) {
      return res.status(400).json({ message: 'Invalid product status' });
    }

    if (shipping_option !== undefined && cleanShippingOption === null) {
      return res.status(400).json({ message: 'Shipping option must be either standard or express' });
    }

    if (is_on_sale !== undefined && cleanIsOnSale === null) {
      return res.status(400).json({ message: 'is_on_sale must be true or false' });
    }

    if (cleanIsOnSale === true && cleanSalePrice === null) {
      return res.status(400).json({ message: 'Sale price is required when sale is enabled' });
    }

    const shouldAutoGenerateSku = requestedAutoSku || !cleanSku;
    const resolvedSku = shouldAutoGenerateSku
      ? await generateUniqueSku({ partNumber: cleanPartNumber, name: cleanName })
      : cleanSku;

    const resolvedIsOnSale = cleanIsOnSale ?? cleanSalePrice !== null;

    const result = await pool.query(
      `INSERT INTO products (
        part_number, name, description, price, buying_price, 
        image, video_url, category_id, stock_quantity, shipping_option, shipping_weight_kg, shipping_dimensions,
        box_number, low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'standard'), $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, COALESCE($20, 'draft'), COALESCE($21::jsonb, '[]'::jsonb), COALESCE($22::jsonb, '[]'::jsonb))
      RETURNING *`,
      [
        cleanPartNumber, cleanName, cleanDescription, parsedPrice, buyingPriceField.value,
        cleanImage, cleanVideoUrl, cleanCategoryId, parsedStockQuantity, cleanShippingOption, parsedShippingWeightKg,
        cleanShippingDimensions ? JSON.stringify(cleanShippingDimensions) : null,
        cleanBoxNumber, cleanLowStockThreshold ?? 5, cleanBrand, resolvedSku, cleanBarcode, cleanSalePrice,
        resolvedIsOnSale, cleanStatus, JSON.stringify(cleanImageUrls), JSON.stringify(cleanBulkPricing)
      ]
    );

    const newProduct = result.rows[0];
    emitProductCreated(newProduct);

    res.status(201).json({
      message: 'Product created successfully',
      product: newProduct
    });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Product with this part number, SKU, or barcode already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Update product (Admin only)
export const updateProduct = async (req, res) => {
  const { id } = req.validatedData || req.params;
  const {
    part_number, name, description, price, buying_price,
    image, video_url, category_id, stock_quantity, shipping_option, shipping_weight_kg, shipping_dimensions, box_number,
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing, auto_generate_sku
  } = req.body;

  try {
    if (!requireProductManagerAccess(req, res)) return;

    const existingResult = await pool.query(
      `SELECT id, name, part_number, price, sale_price, is_on_sale
       FROM products
       WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const existingProduct = existingResult.rows[0];

    const hasNamePayload = hasBodyField(req.body, 'name');
    const hasPartNumberPayload = hasBodyField(req.body, 'part_number');
    const hasPricePayload = hasBodyField(req.body, 'price');
    const hasStockPayload = hasBodyField(req.body, 'stock_quantity');
    const hasBuyingPricePayload = hasBodyField(req.body, 'buying_price');
    const hasCategoryIdPayload = hasBodyField(req.body, 'category_id');
    const hasLowStockPayload = hasBodyField(req.body, 'low_stock_threshold');
    const hasStatusPayload = hasBodyField(req.body, 'status');
    const hasSalePricePayload = hasBodyField(req.body, 'sale_price');
    const hasIsOnSalePayload = hasBodyField(req.body, 'is_on_sale');
    const hasImageUrlsPayload = hasBodyField(req.body, 'image_urls');
    const hasBulkPricingPayload = hasBodyField(req.body, 'bulk_pricing');
    const hasShippingOptionPayload = hasBodyField(req.body, 'shipping_option');
    const hasShippingWeightPayload = hasBodyField(req.body, 'shipping_weight_kg');
    const hasShippingDimensionsPayload = hasBodyField(req.body, 'shipping_dimensions');

    const cleanName = hasNamePayload ? (sanitizePlainText(name, { maxLength: 255 }) || '') : null;
    if (hasNamePayload && !cleanName) {
      return res.status(400).json({ message: 'Product name cannot be empty' });
    }

    const parsedPrice = hasPricePayload ? parseRequiredPositiveNumber(price) : null;
    if (hasPricePayload && parsedPrice === null) {
      return res.status(400).json({ message: 'Price must be greater than 0' });
    }

    const parsedStockQuantity = hasStockPayload ? parseRequiredNonNegativeInteger(stock_quantity) : null;
    if (hasStockPayload && parsedStockQuantity === null) {
      return res.status(400).json({ message: 'Stock quantity must be an integer 0 or higher' });
    }

    const shippingWeightField = parseOptionalNumberField(shipping_weight_kg);
    if (hasShippingWeightPayload) {
      if (!shippingWeightField.valid || shippingWeightField.value === null || shippingWeightField.value <= 0) {
        return res.status(400).json({ message: 'Shipping weight (kg) must be greater than 0' });
      }
    }

    const shippingDimensionsField = parseOptionalShippingDimensionsField(shipping_dimensions);
    if (hasShippingDimensionsPayload && !shippingDimensionsField.valid) {
      return res.status(400).json({ message: shippingDimensionsField.error || 'Shipping dimensions are invalid' });
    }

    const buyingPriceField = parseOptionalNumberField(buying_price);
    if (hasBuyingPricePayload && !buyingPriceField.valid) {
      return res.status(400).json({ message: 'Buying price must be a valid number' });
    }
    if (hasBuyingPricePayload && buyingPriceField.value !== null && buyingPriceField.value < 0) {
      return res.status(400).json({ message: 'Buying price must be 0 or higher' });
    }

    const categoryIdField = parseOptionalIntegerField(category_id);
    if (hasCategoryIdPayload && !categoryIdField.valid) {
      return res.status(400).json({ message: 'Category must be a whole number' });
    }
    if (hasCategoryIdPayload && categoryIdField.value !== null && categoryIdField.value <= 0) {
      return res.status(400).json({ message: 'Category must be a positive integer' });
    }

    const lowStockThresholdField = parseOptionalIntegerField(low_stock_threshold);
    if (hasLowStockPayload && !lowStockThresholdField.valid) {
      return res.status(400).json({ message: 'Low stock threshold must be a whole number' });
    }
    if (hasLowStockPayload && lowStockThresholdField.value !== null && lowStockThresholdField.value < 0) {
      return res.status(400).json({ message: 'Low stock threshold must be 0 or higher' });
    }

    const salePriceField = parseOptionalNumberField(sale_price);
    if (hasSalePricePayload && !salePriceField.valid) {
      return res.status(400).json({ message: 'Sale price must be a valid number' });
    }

    const resolvedPrice = hasPricePayload ? parsedPrice : Number(existingProduct.price);
    const nextSalePrice = hasSalePricePayload
      ? salePriceField.value
      : (existingProduct.sale_price !== null ? Number(existingProduct.sale_price) : null);

    if (nextSalePrice !== null && nextSalePrice <= 0) {
      return res.status(400).json({ message: 'Sale price must be greater than 0' });
    }

    if (nextSalePrice !== null && Number.isFinite(resolvedPrice) && nextSalePrice >= resolvedPrice) {
      return res.status(400).json({ message: 'Sale price must be lower than regular price' });
    }

    const cleanDescription = hasBodyField(req.body, 'description')
      ? sanitizeRichText(description, { maxLength: 10000 })
      : null;
    const cleanPartNumber = sanitizePlainText(part_number, { maxLength: 100 });
    const requestedAutoSku = toNullableBoolean(auto_generate_sku) === true;
    const cleanSku = sanitizePlainText(sku, { maxLength: 100 });
    const cleanBarcode = sanitizePlainText(barcode, { maxLength: 100 });
    const cleanImage = sanitizeHttpUrlOrPath(image);
    const cleanVideoUrl = sanitizeHttpUrlOrPath(video_url);
    const cleanBrand = sanitizePlainText(brand, { maxLength: 100 });
    const cleanBoxNumber = sanitizePlainText(box_number, { maxLength: 100 });
    const cleanCategoryId = categoryIdField.value;
    const cleanLowStockThreshold = lowStockThresholdField.value;
    const cleanIsOnSale = hasIsOnSalePayload ? toNullableBoolean(is_on_sale) : null;
    const cleanStatus = toNullableProductStatus(status);
    const cleanShippingOption = hasShippingOptionPayload ? toNullableShippingOption(shipping_option) : null;
    const cleanImageUrls = Array.isArray(image_urls)
      ? sanitizeUrlArray(image_urls, { maxItems: 9 })
      : normalizeProductImageUrls(image_urls);
    const hasVideoUrlPayload = hasBodyField(req.body, 'video_url');
    const imageUrlsPayload = hasImageUrlsPayload ? JSON.stringify(cleanImageUrls) : null;
    const shippingDimensionsPayload = hasShippingDimensionsPayload
      ? (shippingDimensionsField.value ? JSON.stringify(shippingDimensionsField.value) : null)
      : null;

    if (hasBodyField(req.body, 'image') && image !== null && image !== '' && !cleanImage) {
      return res.status(400).json({ message: 'Image URL is invalid' });
    }

    if (hasVideoUrlPayload && video_url !== null && video_url !== '' && !cleanVideoUrl) {
      return res.status(400).json({ message: 'Video URL is invalid' });
    }

    if (hasStatusPayload && cleanStatus === null) {
      return res.status(400).json({ message: 'Invalid product status' });
    }

    if (hasShippingOptionPayload && cleanShippingOption === null) {
      return res.status(400).json({ message: 'Shipping option must be either standard or express' });
    }

    if (hasIsOnSalePayload && cleanIsOnSale === null) {
      return res.status(400).json({ message: 'is_on_sale must be true or false' });
    }

    const nextIsOnSale = hasIsOnSalePayload
      ? cleanIsOnSale
      : Boolean(existingProduct.is_on_sale);

    if (nextIsOnSale && nextSalePrice === null) {
      return res.status(400).json({ message: 'Sale price is required when sale is enabled' });
    }

    const bulkPricingValidation = hasBulkPricingPayload
      ? validateAndNormalizeBulkPricing(bulk_pricing, resolvedPrice)
      : { value: undefined };
    if (bulkPricingValidation.error) {
      return res.status(400).json({ message: bulkPricingValidation.error });
    }

    const bulkPricingPayload = hasBulkPricingPayload
      ? JSON.stringify(bulkPricingValidation.value ?? [])
      : null;

    const hasSkuPayload = hasBodyField(req.body, 'sku');
    let resolvedSku = hasSkuPayload ? cleanSku : null;
    if (requestedAutoSku || (hasSkuPayload && !cleanSku)) {
      resolvedSku = await generateUniqueSku({
        partNumber: hasPartNumberPayload ? cleanPartNumber : existingProduct.part_number,
        name: hasNamePayload ? cleanName : existingProduct.name,
        excludeProductId: Number(id),
      });
    }

    const result = await pool.query(
      `UPDATE products SET
        part_number = COALESCE($1, part_number),
        name = COALESCE($2, name),
        description = CASE WHEN $31 THEN $3 ELSE description END,
        price = COALESCE($4, price),
        buying_price = COALESCE($5, buying_price),
        image = COALESCE($6, image),
        category_id = COALESCE($7, category_id),
        stock_quantity = COALESCE($8, stock_quantity),
        box_number = COALESCE($9, box_number),
        low_stock_threshold = COALESCE($10, low_stock_threshold),
        brand = COALESCE($11, brand),
        sku = COALESCE($12, sku),
        barcode = COALESCE($13, barcode),
        sale_price = CASE WHEN $14 THEN $15 ELSE sale_price END,
        is_on_sale = COALESCE($16, is_on_sale),
        status = COALESCE($17, status),
        video_url = CASE WHEN $18 THEN $19 ELSE video_url END,
        image_urls = CASE WHEN $20 THEN COALESCE($21::jsonb, '[]'::jsonb) ELSE image_urls END,
        bulk_pricing = CASE WHEN $22 THEN COALESCE($23::jsonb, '[]'::jsonb) ELSE bulk_pricing END,
        shipping_option = CASE WHEN $24 THEN $25 ELSE shipping_option END,
        shipping_weight_kg = CASE WHEN $26 THEN $27 ELSE shipping_weight_kg END,
        shipping_dimensions = CASE WHEN $28 THEN $29::jsonb ELSE shipping_dimensions END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $30
      RETURNING *`,
      [
        hasPartNumberPayload ? cleanPartNumber : null,
        hasNamePayload ? cleanName : null,
        hasBodyField(req.body, 'description') ? cleanDescription : null,
        hasPricePayload ? parsedPrice : null,
        hasBuyingPricePayload ? buyingPriceField.value : null,
        hasBodyField(req.body, 'image') ? cleanImage : null,
        hasCategoryIdPayload ? cleanCategoryId : null,
        hasStockPayload ? parsedStockQuantity : null,
        hasBodyField(req.body, 'box_number') ? cleanBoxNumber : null,
        hasLowStockPayload ? cleanLowStockThreshold : null,
        hasBodyField(req.body, 'brand') ? cleanBrand : null,
        (requestedAutoSku || hasSkuPayload) ? resolvedSku : null,
        hasBodyField(req.body, 'barcode') ? cleanBarcode : null,
        hasSalePricePayload,
        hasSalePricePayload ? salePriceField.value : null,
        hasIsOnSalePayload ? cleanIsOnSale : null,
        hasStatusPayload ? cleanStatus : null,
        hasVideoUrlPayload,
        cleanVideoUrl,
        hasImageUrlsPayload,
        imageUrlsPayload,
        hasBulkPricingPayload,
        bulkPricingPayload,
        hasShippingOptionPayload,
        cleanShippingOption,
        hasShippingWeightPayload,
        hasShippingWeightPayload ? shippingWeightField.value : null,
        hasShippingDimensionsPayload,
        shippingDimensionsPayload,
        id,
        hasBodyField(req.body, 'description')
      ]
    );

    const updatedProduct = result.rows[0];
    emitProductUpdated(updatedProduct);

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Product with this part number, SKU, or barcode already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload product image
export const uploadProductImage = async (req, res) => {
  try {
    if (!requireProductManagerAccess(req, res)) return;

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: 'Product media storage is not configured. Please contact support.' });
    }

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ message: 'Unsupported file type. Use JPG, PNG, WEBP, or GIF.' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const ext = MIME_EXTENSION_MAP[contentType] || 'bin';
    const { url: imageUrl } = await uploadBufferToCloudinary({
      buffer: req.body,
      contentType,
      folder: 'products/images',
      publicId: `product-image-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}-${ext}`,
      resourceType: 'image',
    });

    res.status(201).json({
      message: 'Image uploaded successfully',
      imageUrl
    });
  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload product video
export const uploadProductVideo = async (req, res) => {
  try {
    if (!requireProductManagerAccess(req, res)) return;

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: 'Product media storage is not configured. Please contact support.' });
    }

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!ALLOWED_VIDEO_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ message: 'Unsupported video type. Use MP4, WEBM, MOV, OGG, or M4V.' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Video file is required' });
    }

    if (req.body.length > PRODUCT_VIDEO_MAX_BYTES) {
      return res.status(400).json({ message: 'Video must be 20MB or smaller.' });
    }

    const ext = MIME_EXTENSION_MAP[contentType] || 'bin';
    const { url: videoUrl } = await uploadBufferToCloudinary({
      buffer: req.body,
      contentType,
      folder: 'products/videos',
      publicId: `product-video-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}-${ext}`,
      resourceType: 'video',
    });

    res.status(201).json({
      message: 'Video uploaded successfully',
      videoUrl
    });
  } catch (error) {
    console.error('Upload product video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete product (Admin only)
export const deleteProduct = async (req, res) => {
  const { id } = req.validatedData || req.params;

  try {
    if (!requireProductManagerAccess(req, res)) return;

    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    emitProductDeleted(id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
