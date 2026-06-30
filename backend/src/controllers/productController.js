import pool from '../config/database.js';
import crypto from 'crypto';
import { emitProductCreated, emitProductUpdated, emitProductDeleted } from '../socket.js';
import {
  PRODUCT_PUBLISHER_ROLE_SET,
  PRODUCT_SHIPPING_OPTION_SET,
  PRODUCT_STATUS_SET,
  PRODUCT_TYPE_SET,
} from '../constants/schemaEnums.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../services/cloudinary.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch, supabaseRestRequest } from '../services/supabaseRest.js';
import {
  sanitizeHttpUrlOrPath,
  sanitizePlainText,
  sanitizeRichText,
  sanitizeUrlArray,
} from '../utils/inputSanitizer.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v']);
const ALLOWED_PRODUCT_STATUSES = PRODUCT_STATUS_SET;
const ALLOWED_PRODUCT_TYPES = PRODUCT_TYPE_SET;
const ALLOWED_PRODUCT_SHIPPING_OPTIONS = PRODUCT_SHIPPING_OPTION_SET;
const PRODUCT_PUBLISHER_ROLES = PRODUCT_PUBLISHER_ROLE_SET;
const PRODUCT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const SKU_MAX_GENERATION_ATTEMPTS = 10;
const TOP_SELLER_ORDER_STATUS_SQL = "('delivered')";
const TOP_SELLER_EXCLUDED_RETURN_STATUS_SQL = "('approved', 'refunded', 'exchanged')";
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
    if (shouldUseDatabaseReadFallback()) return candidate;
    const exists = await skuExists(candidate, excludeProductId);
    if (!exists) return candidate;
  }

  const fallback = `${base}-${Date.now().toString(36).toUpperCase()}`;
  return fallback.slice(0, 100);
};

const toNullableProductStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'published' || normalized === 'available') return 'active';
  if (normalized === 'hidden') return 'draft';
  if (normalized === 'out-of-stock' || normalized === 'sold_out') return 'out_of_stock';
  if (!normalized) return null;
  return ALLOWED_PRODUCT_STATUSES.has(normalized) ? normalized : null;
};

const toNullableProductType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return ALLOWED_PRODUCT_TYPES.has(normalized) ? normalized : null;
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

const normalizeFitmentsPayload = (value) => {
  if (value === undefined) return { provided: false, value: [] };
  if (value === null || value === '') return { provided: true, value: [] };

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { provided: true, error: 'Fitments must be a valid JSON array.' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { provided: true, error: 'Fitments must be an array.' };
  }

  const normalized = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const brand = sanitizePlainText(item.brand, { maxLength: 100 });
    const model = sanitizePlainText(item.model ?? item.category, { maxLength: 100 });
    const startYearRaw = item.start_year ?? item.startYear;
    const endYearRaw = item.end_year ?? item.endYear;
    const startYear = startYearRaw === undefined || startYearRaw === null || startYearRaw === '' ? null : Number(startYearRaw);
    const endYear = endYearRaw === undefined || endYearRaw === null || endYearRaw === '' ? null : Number(endYearRaw);

    if (!brand || !model) {
      return { provided: true, error: 'Each fitment requires brand and model.' };
    }
    if ((startYear !== null && (!Number.isInteger(startYear) || startYear < 1900 || startYear > 2100)) ||
        (endYear !== null && (!Number.isInteger(endYear) || endYear < 1900 || endYear > 2100))) {
      return { provided: true, error: 'Fitment years must be between 1900 and 2100.' };
    }
    if (startYear !== null && endYear !== null && startYear > endYear) {
      return { provided: true, error: 'Fitment start year cannot be later than end year.' };
    }

    normalized.push({ brand, model, start_year: startYear, end_year: endYear });
  }

  return { provided: true, value: normalized.slice(0, 100) };
};

const normalizeBundleComponentsPayload = (value) => {
  if (value === undefined) return { provided: false, value: [] };
  if (value === null || value === '') return { provided: true, value: [] };

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { provided: true, error: 'Bundle components must be a valid JSON array.' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { provided: true, error: 'Bundle components must be an array.' };
  }

  const seen = new Set();
  const normalized = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const componentProductId = Number(item.component_product_id ?? item.componentProductId ?? item.product_id ?? item.productId);
    const quantity = Number(item.quantity);
    const displayOrder = Number(item.display_order ?? item.displayOrder ?? normalized.length);

    if (!Number.isInteger(componentProductId) || componentProductId <= 0) {
      return { provided: true, error: 'Each bundle component requires a valid component_product_id.' };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { provided: true, error: 'Each bundle component quantity must be at least 1.' };
    }
    if (seen.has(componentProductId)) continue;
    seen.add(componentProductId);
    normalized.push({
      component_product_id: componentProductId,
      quantity,
      display_order: Number.isInteger(displayOrder) ? displayOrder : normalized.length,
    });
  }

  return { provided: true, value: normalized.slice(0, 100) };
};

const saveProductRelations = async (db, productId, { fitments, bundleComponents } = {}) => {
  if (fitments?.provided) {
    await db.query('DELETE FROM product_fitments WHERE product_id = $1', [productId]);
    for (const fitment of fitments.value) {
      await db.query(
        `INSERT INTO product_fitments (product_id, brand, model, start_year, end_year)
         VALUES ($1, $2, $3, $4, $5)`,
        [productId, fitment.brand, fitment.model, fitment.start_year, fitment.end_year]
      );
    }
  }

  if (bundleComponents?.provided) {
    await db.query('DELETE FROM product_bundle_components WHERE bundle_product_id = $1', [productId]);
    for (const component of bundleComponents.value) {
      if (Number(component.component_product_id) === Number(productId)) {
        throw new Error('A bundle cannot include itself as a component.');
      }
      await db.query(
        `INSERT INTO product_bundle_components (bundle_product_id, component_product_id, quantity, display_order)
         VALUES ($1, $2, $3, $4)`,
        [productId, component.component_product_id, component.quantity, component.display_order]
      );
    }
  }
};

const loadProductRelations = async (productIds = []) => {
  const ids = [...new Set(productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const relationMap = new Map(ids.map((id) => [id, { fitments: [], bundle_components: [] }]));
  if (ids.length === 0) return relationMap;

  const [fitmentsResult, componentsResult] = await Promise.all([
    pool.query(
      `SELECT id, product_id, brand, model, start_year, end_year
       FROM product_fitments
       WHERE product_id = ANY($1::int[])
       ORDER BY brand ASC, model ASC, start_year ASC NULLS FIRST, id ASC`,
      [ids]
    ),
    pool.query(
      `SELECT bc.id, bc.bundle_product_id, bc.component_product_id, bc.quantity, bc.display_order,
              p.name as component_name, p.part_number as component_part_number, p.sku as component_sku,
              p.stock_quantity as component_stock_quantity, p.status as component_status
       FROM product_bundle_components bc
       LEFT JOIN products p ON p.id = bc.component_product_id
       WHERE bc.bundle_product_id = ANY($1::int[])
       ORDER BY bc.display_order ASC, bc.id ASC`,
      [ids]
    ),
  ]);

  for (const fitment of fitmentsResult.rows) {
    relationMap.get(Number(fitment.product_id))?.fitments.push({
      ...fitment,
      start_year: fitment.start_year === null ? null : Number(fitment.start_year),
      end_year: fitment.end_year === null ? null : Number(fitment.end_year),
    });
  }

  for (const component of componentsResult.rows) {
    relationMap.get(Number(component.bundle_product_id))?.bundle_components.push({
      ...component,
      quantity: Number(component.quantity),
      display_order: Number(component.display_order),
      component_stock_quantity: Number(component.component_stock_quantity || 0),
    });
  }

  return relationMap;
};

const computePurchasableStock = (product, bundleComponents = []) => {
  if (String(product.product_type || 'single') !== 'bundle') {
    return Math.max(0, Number(product.stock_quantity || 0));
  }

  if (!bundleComponents.length) return 0;

  return Math.max(0, Math.min(...bundleComponents.map((component) => {
    const qty = Math.max(1, Number(component.quantity || 1));
    return Math.floor(Math.max(0, Number(component.component_stock_quantity || 0)) / qty);
  })));
};

const mapProductResponse = (product, { includeInternal = false, relations = null } = {}) => {
  const rel = relations || { fitments: [], bundle_components: [] };
  const purchasableStock = computePurchasableStock(product, rel.bundle_components);
  const mapped = {
    ...product,
    product_type: product.product_type || 'single',
    rating: parseFloat(product.review_rating ?? product.rating ?? 0),
    review_count: parseInt(product.review_count ?? 0, 10),
    view_count: parseInt(product.view_count ?? 0, 10),
    price: parseFloat(product.price),
    sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
    shipping_option: toNullableShippingOption(product.shipping_option) || 'standard',
    shipping_weight_kg: product.shipping_weight_kg !== null ? parseFloat(product.shipping_weight_kg) : null,
    stock_quantity: purchasableStock,
    available_stock: parseInt(product.stock_quantity ?? purchasableStock, 10),
    reserved_stock: parseInt(product.reserved_stock ?? 0, 10),
    damaged_stock: parseInt(product.damaged_stock ?? 0, 10),
    total_sold: parseInt(product.total_sold ?? 0, 10),
    fitments: rel.fitments,
    bundle_components: rel.bundle_components,
  };

  if (includeInternal) {
    mapped.buying_price = product.buying_price !== null && product.buying_price !== undefined
      ? parseFloat(product.buying_price)
      : null;
    return mapped;
  }

  delete mapped.buying_price;
  delete mapped.box_number;
  delete mapped.product_box_number;
  delete mapped.damaged_stock;
  return mapped;
};

const mapSupabaseRestProduct = (product, { includeInternal = false } = {}) => {
  const categoryName = product.category_name || product.categories?.name || null;
  return mapProductResponse({
    ...product,
    category_name: categoryName,
    review_rating: product.rating || 0,
    review_count: product.review_count || 0,
    total_sold: product.total_sold || 0,
    product_type: product.product_type || 'single',
    reserved_stock: product.reserved_stock || 0,
    damaged_stock: product.damaged_stock || 0,
    shipping_option: product.shipping_option || 'standard',
    shipping_weight_kg: product.shipping_weight_kg ?? 0.1,
  }, {
    includeInternal,
    relations: {
      fitments: [],
      bundle_components: [],
    },
  });
};

const getSupabaseRestProductsFallback = async ({ queryInput = {}, includeInternal = false, singleId = null } = {}) => {
  const limit = parseResultLimit(queryInput.limit, null, 80);
  const params = {
    select: '*,categories(name)',
    order: 'id.desc',
  };

  if (singleId) {
    params.id = `eq.${singleId}`;
    params.limit = 1;
  } else if (limit) {
    params.limit = limit;
  }

  if (!includeInternal) {
    params.status = 'in.(active,out_of_stock)';
    params.is_deleted = 'eq.false';
  } else if (queryInput.status) {
    const cleanStatusFilter = toNullableProductStatus(queryInput.status);
    if (cleanStatusFilter) {
      params.status = `eq.${cleanStatusFilter}`;
    }
  }

  if (queryInput.category) {
    params.category_id = `eq.${queryInput.category}`;
  }

  const searchPhrase = normalizeSearchPhrase(queryInput.search);
  if (searchPhrase) {
    const term = searchPhrase.replace(/[(),]/g, ' ');
    params.or = `(name.ilike.*${term}*,part_number.ilike.*${term}*,description.ilike.*${term}*,brand.ilike.*${term}*,sku.ilike.*${term}*)`;
  }

  let products = await supabaseRestFetch('products', params);
  products = Array.isArray(products) ? products : [];

  if (!singleId && (queryInput.brand || queryInput.model || queryInput.year)) {
    const fitmentParams = {
      select: 'product_id,brand,model,start_year,end_year',
    };
    if (queryInput.brand) fitmentParams.brand = `ilike.${String(queryInput.brand).trim()}`;
    if (queryInput.model) fitmentParams.model = `ilike.${String(queryInput.model).trim()}`;

    const fitments = await supabaseRestFetch('product_fitments', fitmentParams).catch(() => []);
    const year = queryInput.year === undefined || queryInput.year === null || queryInput.year === '' ? null : Number(queryInput.year);
    const matchingIds = new Set((Array.isArray(fitments) ? fitments : [])
      .filter((fitment) => {
        if (!Number.isInteger(year)) return true;
        const start = fitment.start_year === null || fitment.start_year === undefined ? null : Number(fitment.start_year);
        const end = fitment.end_year === null || fitment.end_year === undefined ? null : Number(fitment.end_year);
        return (start === null || start <= year) && (end === null || end >= year);
      })
      .map((fitment) => Number(fitment.product_id)));
    products = products.filter((product) => matchingIds.has(Number(product.id)));
  }

  return products.map((product) => mapSupabaseRestProduct(product, { includeInternal }));
};

const ensureProductSchema = async () => {
  // Schema is managed exclusively by Knex migrations.
  return;
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS video_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS bulk_pricing JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS shipping_option VARCHAR(20) DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS shipping_weight_kg DECIMAL(10, 3),
      ADD COLUMN IF NOT EXISTS shipping_dimensions JSONB,
      ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'single',
      ADD COLUMN IF NOT EXISTS reserved_stock INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS damaged_stock INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 1) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS color VARCHAR(100);
  `).catch((error) => {
    console.error('Failed to ensure product media columns:', error);
  });

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status_enum') THEN
        ALTER TABLE products ALTER COLUMN status TYPE varchar(20) USING status::text;
        DROP TYPE product_status_enum;
      END IF;
    END $$;

    UPDATE products
    SET status = 'draft'
    WHERE status = 'hidden';

    UPDATE products
    SET status = 'active'
    WHERE status IN ('published', 'available');

    UPDATE products
    SET status = 'out_of_stock'
    WHERE status IN ('sold_out', 'out-of-stock');

    UPDATE products
    SET status = 'draft'
    WHERE status IS NULL;

    ALTER TABLE products
    ALTER COLUMN status SET DEFAULT 'draft';

    ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_status_check;

    ALTER TABLE products
    ADD CONSTRAINT products_status_check
      CHECK (status IN ('draft', 'active', 'out_of_stock', 'archived'));

    UPDATE products SET product_type = 'single' WHERE product_type IS NULL OR product_type NOT IN ('single', 'bundle');
    UPDATE products SET reserved_stock = 0 WHERE reserved_stock IS NULL OR reserved_stock < 0;
    UPDATE products SET damaged_stock = 0 WHERE damaged_stock IS NULL OR damaged_stock < 0;

    ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_product_type_check;

    ALTER TABLE products
    ADD CONSTRAINT products_product_type_check
      CHECK (product_type IN ('single', 'bundle'));

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_fitments (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      brand VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL,
      start_year INTEGER,
      end_year INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_bundle_components (
      id SERIAL PRIMARY KEY,
      bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (bundle_product_id, component_product_id)
    );
  `).catch((error) => {
    console.error('Failed to ensure product fitment/bundle tables:', error);
  });
};

const ensureProductSchemaReady = ensureProductSchema().catch((error) => {
  console.error('Failed to ensure product schema:', error);
});

// Get all products
export const getProducts = async (req, res) => {
  try {
    const queryInput = { ...(req.query || {}), ...(req.validatedData || {}) };
    const { category, search, limit: limitParam, brand, model, year } = queryInput;
    const searchTerms = tokenizeSearchTerms(search);
    const searchPhrase = normalizeSearchPhrase(search);
    const resultLimit = parseResultLimit(limitParam, null, 80);
    const includeUnpublished = canViewUnpublishedProducts(req.user);

    if (shouldUseDatabaseReadFallback()) {
      const fallbackProducts = await getSupabaseRestProductsFallback({ queryInput, includeInternal: includeUnpublished });
      return res.json(fallbackProducts);
    }
    
    let selectClause = `
      SELECT p.*, c.name as category_name,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id
          AND o.status IN ${TOP_SELLER_ORDER_STATUS_SQL}
          AND NOT EXISTS (
            SELECT 1
            FROM returns rt
            WHERE rt.order_id = o.id
              AND rt.status IN ${TOP_SELLER_EXCLUDED_RETURN_STATUS_SQL}
          )
      ), 0) as total_sold,
      COALESCE((
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), p.rating, 0) as review_rating,
      COALESCE((
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), 0) as review_count
    `;
    let fromClause = 'FROM products p LEFT JOIN categories c ON p.category_id = c.id';
    let whereClause = 'WHERE 1=1';
    let orderByClause = '';
    const params = [];

    if (!includeUnpublished) {
      whereClause += ` AND p.status IN ('active', 'out_of_stock') AND COALESCE(p.is_deleted, false) = false`;
    } else if (queryInput.status) {
      const cleanStatusFilter = toNullableProductStatus(queryInput.status);
      if (cleanStatusFilter) {
        params.push(cleanStatusFilter);
        whereClause += ` AND p.status = $${params.length}`;
      }
    }

    // Filter by category
    if (category) {
      params.push(category);
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    const cleanFitmentBrand = sanitizePlainText(brand, { maxLength: 100 });
    const cleanFitmentModel = sanitizePlainText(model, { maxLength: 100 });
    const fitmentYear = year === undefined || year === null || year === '' ? null : Number(year);

    if (cleanFitmentBrand || cleanFitmentModel || fitmentYear !== null) {
      const fitmentFilters = ['pf.product_id = p.id'];
      if (cleanFitmentBrand) {
        params.push(cleanFitmentBrand);
        fitmentFilters.push(`pf.brand ILIKE $${params.length}`);
      }
      if (cleanFitmentModel) {
        params.push(cleanFitmentModel);
        fitmentFilters.push(`pf.model ILIKE $${params.length}`);
      }
      if (Number.isInteger(fitmentYear)) {
        params.push(fitmentYear);
        const yearIdx = params.length;
        fitmentFilters.push(`(pf.start_year IS NULL OR pf.start_year <= $${yearIdx})`);
        fitmentFilters.push(`(pf.end_year IS NULL OR pf.end_year >= $${yearIdx})`);
      }
      whereClause += ` AND EXISTS (SELECT 1 FROM product_fitments pf WHERE ${fitmentFilters.join(' AND ')})`;
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
    const relations = await loadProductRelations(result.rows.map((product) => product.id));
    
    res.json(result.rows.map((product) => mapProductResponse(product, {
      includeInternal: includeUnpublished,
      relations: relations.get(Number(product.id)),
    })));
  } catch (error) {
    console.error('Get products error:', error);
    if (isDatabaseConnectivityError(error)) {
      try {
        const fallbackProducts = await getSupabaseRestProductsFallback({
          queryInput: { ...(req.query || {}), ...(req.validatedData || {}) },
          includeInternal: canViewUnpublishedProducts(req.user),
        });
        return res.json(fallbackProducts);
      } catch (fallbackError) {
        console.error('Get products Supabase REST fallback error:', fallbackError);
      }
    }
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

    if (shouldUseDatabaseReadFallback()) {
      const fallbackProducts = await getSupabaseRestProductsFallback({
        queryInput: { limit: safeLimit },
        includeInternal: includeUnpublished,
      });
      return res.json(fallbackProducts.slice(0, safeLimit));
    }

    const params = [safeLimit];
    let whereClause = `
      WHERE o.status IN ${TOP_SELLER_ORDER_STATUS_SQL}
        AND NOT EXISTS (
          SELECT 1
          FROM returns rt
          WHERE rt.order_id = o.id
            AND rt.status IN ${TOP_SELLER_EXCLUDED_RETURN_STATUS_SQL}
        )
    `;

    if (!includeUnpublished) {
      whereClause += ` AND p.status IN ('active', 'out_of_stock') AND COALESCE(p.is_deleted, false) = false`;
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
        p.id, p.name, p.brand, p.part_number, p.image, p.description, p.product_type,
        p.price, p.sale_price, p.is_on_sale, p.stock_quantity, p.reserved_stock, p.damaged_stock,
        p.low_stock_threshold, p.rating, p.created_at, p.status, p.shipping_option, p.shipping_weight_kg,
        c.name as category_name,
        COALESCE((
          SELECT ROUND(AVG(r.rating)::numeric, 1)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
        ), p.rating, 0) as review_rating,
        COALESCE((
          SELECT COUNT(*)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
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
    
    const relations = await loadProductRelations(result.rows.map((product) => product.id));

    res.json(result.rows.map((product) => mapProductResponse(product, {
      includeInternal: includeUnpublished,
      relations: relations.get(Number(product.id)),
    })));
  } catch (error) {
    console.error('Get top sellers error:', error);
    if (isDatabaseConnectivityError(error)) {
      try {
        const { limit = 8 } = req.validatedData || req.query;
        const parsedLimit = Number.parseInt(String(limit), 10);
        const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 8;
        const fallbackProducts = await getSupabaseRestProductsFallback({
          queryInput: { limit: safeLimit },
          includeInternal: canViewUnpublishedProducts(req.user),
        });
        return res.json(fallbackProducts.slice(0, safeLimit));
      } catch (fallbackError) {
        console.error('Get top sellers Supabase REST fallback error:', fallbackError);
      }
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single product by ID
export const getProductById = async (req, res) => {
  try {
    await ensureProductSchemaReady;

    const { id } = req.validatedData || req.params;
    const includeUnpublished = canViewUnpublishedProducts(req.user);

    if (shouldUseDatabaseReadFallback()) {
      const fallbackProducts = await getSupabaseRestProductsFallback({
        queryInput: {},
        includeInternal: includeUnpublished,
        singleId: id,
      });

      if (fallbackProducts.length === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      return res.json({
        ...fallbackProducts[0],
        variant_options: [],
        variants: [],
      });
    }
    
    const result = await pool.query(
      `SELECT p.*, c.name as category_name,
              COALESCE((
                SELECT ROUND(AVG(r.rating)::numeric, 1)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
              ), p.rating, 0) as review_rating,
              COALESCE((
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status::text, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
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

    if (!includeUnpublished && (!['active', 'out_of_stock'].includes(String(product.status || '').toLowerCase()) || product.is_deleted)) {
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

    const relations = await loadProductRelations([product.id]);
    const mappedProduct = mapProductResponse(product, {
      includeInternal: includeUnpublished,
      relations: relations.get(Number(product.id)),
    });

    res.json({
      ...mappedProduct,
      variant_options: variantOptions,
      variants,
    });
  } catch (error) {
    console.error('Get product error:', error);
    if (isDatabaseConnectivityError(error)) {
      try {
        const { id } = req.validatedData || req.params;
        const fallbackProducts = await getSupabaseRestProductsFallback({
          queryInput: {},
          includeInternal: canViewUnpublishedProducts(req.user),
          singleId: id,
        });

        if (fallbackProducts.length === 0) {
          return res.status(404).json({ message: 'Product not found' });
        }

        return res.json({
          ...fallbackProducts[0],
          variant_options: [],
          variants: [],
        });
      } catch (fallbackError) {
        console.error('Get product Supabase REST fallback error:', fallbackError);
      }
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const recordProductView = async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product ID.' });
  }

  try {
    const product = await pool.query(
      `SELECT id FROM products WHERE id = $1 AND status = 'active' AND COALESCE(is_deleted, false) = false`,
      [productId]
    );
    if (!product.rowCount) return res.status(404).json({ message: 'Product not found.' });

    const userId = req.user?.id || null;
    const visitorSource = userId
      ? `user:${userId}`
      : `${req.ip || ''}:${req.get('user-agent') || ''}`;
    const visitorHash = crypto
      .createHash('sha256')
      .update(`${process.env.VIEW_TRACKING_SALT || process.env.JWT_SECRET || '10th-west-moto'}:${visitorSource}`)
      .digest('hex');

    const inserted = await pool.query(
      `INSERT INTO product_views (product_id, user_id, visitor_hash)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1
         FROM product_views
         WHERE product_id = $1
           AND created_at > NOW() - INTERVAL '30 minutes'
           AND (
             ($2::int IS NOT NULL AND user_id = $2)
             OR ($2::int IS NULL AND visitor_hash = $3)
           )
       )
       RETURNING id`,
      [productId, userId, visitorHash]
    );

    if (inserted.rowCount) {
      await pool.query(
        `UPDATE products SET view_count = COALESCE(view_count, 0) + 1, updated_at = NOW() WHERE id = $1`,
        [productId]
      );
    }

    return res.status(202).json({ recorded: inserted.rowCount > 0 });
  } catch (error) {
    console.error('Record product view error:', error);
    return res.status(500).json({ message: 'Product view could not be recorded.' });
  }
};

// Create new product (Admin only)
export const createProduct = async (req, res) => {
  const {
    part_number, name, description, price, buying_price,
    image, video_url, category_id, stock_quantity, shipping_option, shipping_weight_kg, shipping_dimensions, box_number,
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing, auto_generate_sku,
    product_type, reserved_stock, damaged_stock, color, fitments, bundle_components
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
    const cleanProductType = product_type === undefined ? 'single' : toNullableProductType(product_type);
    const reservedStockField = parseOptionalIntegerField(reserved_stock);
    const damagedStockField = parseOptionalIntegerField(damaged_stock);
    const cleanShippingOption = shipping_option === undefined
      ? 'standard'
      : toNullableShippingOption(shipping_option);
    const cleanImageUrls = Array.isArray(image_urls)
      ? sanitizeUrlArray(image_urls, { maxItems: 9 })
      : normalizeProductImageUrls(image_urls);
    const cleanBulkPricing = bulkPricingValidation.value ?? [];
    const cleanShippingDimensions = shippingDimensionsField.value;
    const cleanColor = sanitizePlainText(color, { maxLength: 100 });
    const fitmentsPayload = normalizeFitmentsPayload(fitments);
    const bundleComponentsPayload = normalizeBundleComponentsPayload(bundle_components);

    if (image !== undefined && image !== null && image !== '' && !cleanImage) {
      return res.status(400).json({ message: 'Image URL is invalid' });
    }

    if (video_url !== undefined && video_url !== null && video_url !== '' && !cleanVideoUrl) {
      return res.status(400).json({ message: 'Video URL is invalid' });
    }

    if (status !== undefined && cleanStatus === null) {
      return res.status(400).json({ message: 'Invalid product status' });
    }

    if (cleanProductType === null) {
      return res.status(400).json({ message: 'Invalid product type' });
    }

    if (!reservedStockField.valid || (reservedStockField.value !== null && reservedStockField.value < 0)) {
      return res.status(400).json({ message: 'Reserved stock must be an integer 0 or higher' });
    }

    if (!damagedStockField.valid || (damagedStockField.value !== null && damagedStockField.value < 0)) {
      return res.status(400).json({ message: 'Damaged stock must be an integer 0 or higher' });
    }

    if (fitmentsPayload.error) {
      return res.status(400).json({ message: fitmentsPayload.error });
    }

    if (bundleComponentsPayload.error) {
      return res.status(400).json({ message: bundleComponentsPayload.error });
    }

    if (cleanProductType === 'bundle' && (!bundleComponentsPayload.provided || bundleComponentsPayload.value.length === 0)) {
      return res.status(400).json({ message: 'Bundle products require at least one component.' });
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

    if (shouldUseDatabaseReadFallback()) {
      const rows = await supabaseRestRequest('products', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          part_number: cleanPartNumber,
          name: cleanName,
          description: cleanDescription,
          price: parsedPrice,
          buying_price: buyingPriceField.value,
          image: cleanImage,
          video_url: cleanVideoUrl,
          category_id: cleanCategoryId,
          stock_quantity: parsedStockQuantity,
          shipping_option: cleanShippingOption || 'standard',
          shipping_weight_kg: parsedShippingWeightKg,
          shipping_dimensions: cleanShippingDimensions,
          box_number: cleanBoxNumber,
          low_stock_threshold: cleanLowStockThreshold ?? 5,
          brand: cleanBrand,
          sku: resolvedSku,
          barcode: cleanBarcode,
          sale_price: cleanSalePrice,
          is_on_sale: resolvedIsOnSale,
          status: cleanStatus || 'draft',
          image_urls: cleanImageUrls,
          bulk_pricing: cleanBulkPricing,
          product_type: cleanProductType || 'single',
          reserved_stock: reservedStockField.value ?? 0,
          damaged_stock: damagedStockField.value ?? 0,
          color: cleanColor,
        },
      });
      const newProduct = Array.isArray(rows) ? rows[0] : rows;
      await req.logActivity?.('product.create', 'product', newProduct?.id, {
        name: newProduct?.name,
        sku: newProduct?.sku,
        status: newProduct?.status,
      });
      emitProductCreated(newProduct);

      return res.status(201).json({
        message: 'Product created successfully',
        product: newProduct,
        degraded: true,
      });
    }

    const result = await pool.query(
      `INSERT INTO products (
        part_number, name, description, price, buying_price, 
        image, video_url, category_id, stock_quantity, shipping_option, shipping_weight_kg, shipping_dimensions,
        box_number, low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing,
        product_type, reserved_stock, damaged_stock, color
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::product_shipping_option_enum, 'standard'::product_shipping_option_enum), $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, COALESCE($20, 'draft'), COALESCE($21::jsonb, '[]'::jsonb), COALESCE($22::jsonb, '[]'::jsonb), COALESCE($23, 'single'), COALESCE($24, 0), COALESCE($25, 0), $26)
      RETURNING *`,
      [
        cleanPartNumber, cleanName, cleanDescription, parsedPrice, buyingPriceField.value,
        cleanImage, cleanVideoUrl, cleanCategoryId, parsedStockQuantity, cleanShippingOption, parsedShippingWeightKg,
        cleanShippingDimensions ? JSON.stringify(cleanShippingDimensions) : null,
        cleanBoxNumber, cleanLowStockThreshold ?? 5, cleanBrand, resolvedSku, cleanBarcode, cleanSalePrice,
        resolvedIsOnSale, cleanStatus, JSON.stringify(cleanImageUrls), JSON.stringify(cleanBulkPricing),
        cleanProductType, reservedStockField.value, damagedStockField.value, cleanColor
      ]
    );

    const newProduct = result.rows[0];
    await saveProductRelations(pool, newProduct.id, {
      fitments: fitmentsPayload,
      bundleComponents: bundleComponentsPayload,
    });
    await req.logActivity?.('product.create', 'product', newProduct.id, {
      name: newProduct.name,
      sku: newProduct.sku,
      status: newProduct.status,
    });
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
    if (error.status === 409) {
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
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status, image_urls, bulk_pricing, auto_generate_sku,
    product_type, reserved_stock, damaged_stock, color, fitments, bundle_components
  } = req.body;

  try {
    if (!requireProductManagerAccess(req, res)) return;

    let existingProduct = null;
    if (shouldUseDatabaseReadFallback()) {
      const rows = await supabaseRestFetch('products', {
        select: 'id,name,part_number,price,sale_price,is_on_sale,product_type',
        id: `eq.${id}`,
        limit: 1,
      });
      existingProduct = Array.isArray(rows) ? rows[0] : null;
    } else {
      const existingResult = await pool.query(
        `SELECT id, name, part_number, price, sale_price, is_on_sale, product_type
         FROM products
         WHERE id = $1`,
        [id]
      );
      existingProduct = existingResult.rows[0] || null;
    }

    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const hasNamePayload = hasBodyField(req.body, 'name');
    const hasPartNumberPayload = hasBodyField(req.body, 'part_number');
    const hasPricePayload = hasBodyField(req.body, 'price');
    const hasStockPayload = hasBodyField(req.body, 'stock_quantity');
    const hasBuyingPricePayload = hasBodyField(req.body, 'buying_price');
    const hasCategoryIdPayload = hasBodyField(req.body, 'category_id');
    const hasLowStockPayload = hasBodyField(req.body, 'low_stock_threshold');
    const hasStatusPayload = hasBodyField(req.body, 'status');
    const hasProductTypePayload = hasBodyField(req.body, 'product_type');
    const hasReservedStockPayload = hasBodyField(req.body, 'reserved_stock');
    const hasDamagedStockPayload = hasBodyField(req.body, 'damaged_stock');
    const hasColorPayload = hasBodyField(req.body, 'color');
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
    const cleanProductType = hasProductTypePayload ? toNullableProductType(product_type) : null;
    const reservedStockField = parseOptionalIntegerField(reserved_stock);
    const damagedStockField = parseOptionalIntegerField(damaged_stock);
    const cleanShippingOption = hasShippingOptionPayload ? toNullableShippingOption(shipping_option) : null;
    const cleanImageUrls = Array.isArray(image_urls)
      ? sanitizeUrlArray(image_urls, { maxItems: 9 })
      : normalizeProductImageUrls(image_urls);
    const hasVideoUrlPayload = hasBodyField(req.body, 'video_url');
    const imageUrlsPayload = hasImageUrlsPayload ? JSON.stringify(cleanImageUrls) : null;
    const shippingDimensionsPayload = hasShippingDimensionsPayload
      ? (shippingDimensionsField.value ? JSON.stringify(shippingDimensionsField.value) : null)
      : null;
    const cleanColor = sanitizePlainText(color, { maxLength: 100 });
    const fitmentsPayload = normalizeFitmentsPayload(fitments);
    const bundleComponentsPayload = normalizeBundleComponentsPayload(bundle_components);

    if (hasBodyField(req.body, 'image') && image !== null && image !== '' && !cleanImage) {
      return res.status(400).json({ message: 'Image URL is invalid' });
    }

    if (hasVideoUrlPayload && video_url !== null && video_url !== '' && !cleanVideoUrl) {
      return res.status(400).json({ message: 'Video URL is invalid' });
    }

    if (hasStatusPayload && cleanStatus === null) {
      return res.status(400).json({ message: 'Invalid product status' });
    }

    if (hasProductTypePayload && cleanProductType === null) {
      return res.status(400).json({ message: 'Invalid product type' });
    }

    if (hasReservedStockPayload && (!reservedStockField.valid || reservedStockField.value === null || reservedStockField.value < 0)) {
      return res.status(400).json({ message: 'Reserved stock must be an integer 0 or higher' });
    }

    if (hasDamagedStockPayload && (!damagedStockField.valid || damagedStockField.value === null || damagedStockField.value < 0)) {
      return res.status(400).json({ message: 'Damaged stock must be an integer 0 or higher' });
    }

    if (fitmentsPayload.error) {
      return res.status(400).json({ message: fitmentsPayload.error });
    }

    if (bundleComponentsPayload.error) {
      return res.status(400).json({ message: bundleComponentsPayload.error });
    }

    if (hasProductTypePayload && cleanProductType === 'bundle' && existingProduct.product_type !== 'bundle' && (!bundleComponentsPayload.provided || bundleComponentsPayload.value.length === 0)) {
      return res.status(400).json({ message: 'Bundle products require at least one component.' });
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

    if (shouldUseDatabaseReadFallback()) {
      const patch = {
        updated_at: new Date().toISOString(),
      };

      if (hasPartNumberPayload) patch.part_number = cleanPartNumber;
      if (hasNamePayload) patch.name = cleanName;
      if (hasBodyField(req.body, 'description')) patch.description = cleanDescription;
      if (hasPricePayload) patch.price = parsedPrice;
      if (hasBuyingPricePayload) patch.buying_price = buyingPriceField.value;
      if (hasBodyField(req.body, 'image')) patch.image = cleanImage;
      if (hasCategoryIdPayload) patch.category_id = cleanCategoryId;
      if (hasStockPayload) patch.stock_quantity = parsedStockQuantity;
      if (hasBodyField(req.body, 'box_number')) patch.box_number = cleanBoxNumber;
      if (hasLowStockPayload) patch.low_stock_threshold = cleanLowStockThreshold;
      if (hasBodyField(req.body, 'brand')) patch.brand = cleanBrand;
      if (requestedAutoSku || hasSkuPayload) patch.sku = resolvedSku;
      if (hasBodyField(req.body, 'barcode')) patch.barcode = cleanBarcode;
      if (hasSalePricePayload) patch.sale_price = salePriceField.value;
      if (hasIsOnSalePayload) patch.is_on_sale = cleanIsOnSale;
      if (hasStatusPayload) patch.status = cleanStatus;
      if (hasVideoUrlPayload) patch.video_url = cleanVideoUrl;
      if (hasImageUrlsPayload) patch.image_urls = cleanImageUrls;
      if (hasBulkPricingPayload) patch.bulk_pricing = bulkPricingValidation.value ?? [];
      if (hasShippingOptionPayload) patch.shipping_option = cleanShippingOption;
      if (hasShippingWeightPayload) patch.shipping_weight_kg = shippingWeightField.value;
      if (hasShippingDimensionsPayload) patch.shipping_dimensions = shippingDimensionsField.value;
      if (hasProductTypePayload) patch.product_type = cleanProductType;
      if (hasReservedStockPayload) patch.reserved_stock = reservedStockField.value;
      if (hasDamagedStockPayload) patch.damaged_stock = damagedStockField.value;
      if (hasColorPayload) patch.color = cleanColor;

      const rows = await supabaseRestRequest('products', {
        method: 'PATCH',
        queryParams: { id: `eq.${id}` },
        prefer: 'return=representation',
        body: patch,
      });
      const updatedProduct = Array.isArray(rows) ? rows[0] : rows;
      emitProductUpdated(updatedProduct);

      return res.json({
        message: 'Product updated successfully',
        product: updatedProduct,
        degraded: true,
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
        product_type = CASE WHEN $32 THEN $33 ELSE product_type END,
        reserved_stock = CASE WHEN $34 THEN $35 ELSE reserved_stock END,
        damaged_stock = CASE WHEN $36 THEN $37 ELSE damaged_stock END,
        color = CASE WHEN $38 THEN $39 ELSE color END,
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
        hasBodyField(req.body, 'description'),
        hasProductTypePayload,
        cleanProductType,
        hasReservedStockPayload,
        hasReservedStockPayload ? reservedStockField.value : null,
        hasDamagedStockPayload,
        hasDamagedStockPayload ? damagedStockField.value : null,
        hasColorPayload,
        hasColorPayload ? cleanColor : null
      ]
    );

    const updatedProduct = result.rows[0];
    await saveProductRelations(pool, id, {
      fitments: fitmentsPayload,
      bundleComponents: bundleComponentsPayload,
    });
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
    if (error.status === 409) {
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

    if (shouldUseDatabaseReadFallback()) {
      const rows = await supabaseRestRequest('products', {
        method: 'PATCH',
        queryParams: { id: `eq.${id}` },
        prefer: 'return=representation',
        body: {
          status: 'archived',
          is_deleted: true,
          updated_at: new Date().toISOString(),
        },
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      emitProductDeleted(id);
      return res.json({
        message: 'Product deleted successfully',
        degraded: true,
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET status = 'archived', is_deleted = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    emitProductDeleted(id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error?.status === 404) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};
