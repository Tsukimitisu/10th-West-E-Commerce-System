import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

const MAX_OPTION_GROUPS = 5;
const MAX_OPTION_VALUES = 30;
const MAX_VARIANT_ROWS = 300;

const normalizeWhitespace = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizeToken = (value, fallback = 'x') => {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
};

const normalizeOptionName = (value) => normalizeWhitespace(value).slice(0, 50);
const normalizeOptionValue = (value) => normalizeWhitespace(value).slice(0, 100);

const buildCombinationKey = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${normalizeToken(optionName, 'opt')}:${normalizeToken(optionCombination?.[optionName], 'val')}`)
  .join('|');

const formatCombinationLabel = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${optionName}: ${optionCombination?.[optionName] || ''}`)
  .join(' / ')
  .slice(0, 100);

const parseOptionValuesInput = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/[\n,|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeVariantOptions = (options) => {
  if (!Array.isArray(options)) {
    return { error: 'Variant options must be an array.' };
  }

  if (options.length === 0) {
    return { error: 'At least one variant option is required.' };
  }

  if (options.length > MAX_OPTION_GROUPS) {
    return { error: `A maximum of ${MAX_OPTION_GROUPS} variant options is supported.` };
  }

  const normalizedOptions = [];
  const seenOptionNames = new Set();

  for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
    const option = options[optionIndex] || {};
    const optionName = normalizeOptionName(option.name ?? option.option_name ?? option.label);

    if (!optionName) {
      return { error: `Variant option #${optionIndex + 1} needs a name.` };
    }

    const optionNameToken = optionName.toLowerCase();
    if (seenOptionNames.has(optionNameToken)) {
      return { error: `Duplicate variant option name: ${optionName}.` };
    }
    seenOptionNames.add(optionNameToken);

    const rawValues = parseOptionValuesInput(option.values ?? option.option_values);
    if (rawValues.length === 0) {
      return { error: `Variant option "${optionName}" must have at least one value.` };
    }

    if (rawValues.length > MAX_OPTION_VALUES) {
      return { error: `Variant option "${optionName}" supports up to ${MAX_OPTION_VALUES} values.` };
    }

    const seenValues = new Set();
    const values = [];

    for (const rawValue of rawValues) {
      const optionValue = normalizeOptionValue(rawValue);
      if (!optionValue) continue;

      const optionValueToken = optionValue.toLowerCase();
      if (seenValues.has(optionValueToken)) continue;

      seenValues.add(optionValueToken);
      values.push(optionValue);
    }

    if (values.length === 0) {
      return { error: `Variant option "${optionName}" must have at least one valid value.` };
    }

    normalizedOptions.push({ name: optionName, values });
  }

  return { value: normalizedOptions };
};

const generateCombinations = (options) => {
  let combinations = [{}];

  for (const option of options) {
    const next = [];
    for (const combination of combinations) {
      for (const value of option.values) {
        next.push({
          ...combination,
          [option.name]: value,
        });

        if (next.length > MAX_VARIANT_ROWS) {
          return {
            error: `Too many combinations. Limit options/values to stay below ${MAX_VARIANT_ROWS} variants.`
          };
        }
      }
    }
    combinations = next;
  }

  return { value: combinations };
};

const normalizeCombinationPayload = (payload, optionOrder) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Each variant needs an option_combination object.' };
  }

  const normalized = {};
  for (const optionName of optionOrder) {
    const rawValue = payload[optionName];
    const optionValue = normalizeOptionValue(rawValue);

    if (!optionValue) {
      return { error: `Variant combination is missing value for "${optionName}".` };
    }

    normalized[optionName] = optionValue;
  }

  return { value: normalized };
};

const normalizeVariantRows = ({ variants, options, basePrice }) => {
  const optionOrder = options.map((option) => option.name);
  const combinationsResult = generateCombinations(options);
  if (combinationsResult.error) return combinationsResult;

  const expectedCombinations = combinationsResult.value;
  const expectedKeySet = new Set(
    expectedCombinations.map((combination) => buildCombinationKey(combination, optionOrder))
  );

  const parsedVariants = Array.isArray(variants) ? variants : [];
  if (variants !== undefined && variants !== null && !Array.isArray(variants)) {
    return { error: 'variants must be an array when provided.' };
  }

  const variantByKey = new Map();

  for (let variantIndex = 0; variantIndex < parsedVariants.length; variantIndex += 1) {
    const variant = parsedVariants[variantIndex] || {};
    const legacySingleOption = optionOrder.length === 1
      ? { [optionOrder[0]]: variant.variant_value }
      : null;

    const normalizedCombinationResult = normalizeCombinationPayload(
      variant.option_combination ?? variant.optionValues ?? legacySingleOption,
      optionOrder,
    );

    if (normalizedCombinationResult.error) {
      return { error: `Variant row ${variantIndex + 1}: ${normalizedCombinationResult.error}` };
    }

    const optionCombination = normalizedCombinationResult.value;
    const combinationKey = buildCombinationKey(optionCombination, optionOrder);

    if (!expectedKeySet.has(combinationKey)) {
      return { error: `Variant row ${variantIndex + 1}: combination does not match selected options.` };
    }

    if (variantByKey.has(combinationKey)) {
      return { error: `Duplicate variant row for combination: ${formatCombinationLabel(optionCombination, optionOrder)}.` };
    }

    const fallbackPrice = Number(basePrice) + Number(variant.price_adjustment ?? variant.additional_price ?? 0);
    const price = Number(variant.price ?? fallbackPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: `Variant row ${variantIndex + 1}: price must be greater than 0.` };
    }

    const stockQuantity = Number(variant.stock_quantity ?? variant.stock ?? 0);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return { error: `Variant row ${variantIndex + 1}: stock must be an integer 0 or higher.` };
    }

    const imageUrl = normalizeWhitespace(variant.image_url ?? variant.imageUrl);
    const sku = normalizeWhitespace(variant.sku);

    variantByKey.set(combinationKey, {
      option_combination: optionCombination,
      combination_key: combinationKey,
      variant_type: 'combination',
      variant_value: formatCombinationLabel(optionCombination, optionOrder),
      price,
      price_adjustment: Number.isFinite(Number(basePrice)) ? Number(price - Number(basePrice)).toFixed(2) : null,
      stock_quantity: stockQuantity,
      image_url: imageUrl || null,
      sku: sku || null,
    });
  }

  const normalizedRows = expectedCombinations.map((combination) => {
    const combinationKey = buildCombinationKey(combination, optionOrder);
    const existing = variantByKey.get(combinationKey);

    if (existing) return existing;

    const fallbackPrice = Number(basePrice);
    return {
      option_combination: combination,
      combination_key: combinationKey,
      variant_type: 'combination',
      variant_value: formatCombinationLabel(combination, optionOrder),
      price: fallbackPrice,
      price_adjustment: Number.isFinite(fallbackPrice) ? Number((fallbackPrice - fallbackPrice).toFixed(2)) : null,
      stock_quantity: 0,
      image_url: null,
      sku: null,
    };
  });

  if (normalizedRows.some((row) => !Number.isFinite(row.price) || row.price <= 0)) {
    return { error: 'Every generated variant must have a price greater than 0.' };
  }

  return { value: normalizedRows };
};

const deriveOptionsFromRows = (rows = []) => {
  const optionOrder = [];
  const optionValuesMap = new Map();

  for (const row of rows) {
    let optionCombination = row.option_combination;
    if (!optionCombination || typeof optionCombination !== 'object' || Array.isArray(optionCombination)) {
      if (row.variant_type && row.variant_value) {
        const fallbackOptionName = normalizeOptionName(row.variant_type) || 'Option';
        const fallbackOptionValue = normalizeOptionValue(row.variant_value);
        if (!fallbackOptionValue) continue;
        optionCombination = { [fallbackOptionName]: fallbackOptionValue };
      } else {
        continue;
      }
    }

    for (const [rawName, rawValue] of Object.entries(optionCombination)) {
      const optionName = normalizeOptionName(rawName);
      const optionValue = normalizeOptionValue(rawValue);
      if (!optionName || !optionValue) continue;

      if (!optionValuesMap.has(optionName)) {
        optionValuesMap.set(optionName, []);
        optionOrder.push(optionName);
      }

      const values = optionValuesMap.get(optionName);
      if (!values.includes(optionValue)) {
        values.push(optionValue);
      }
    }
  }

  return optionOrder.map((name) => ({ name, values: optionValuesMap.get(name) || [] }));
};

const mapDbRowToVariant = (row, optionOrder, basePrice) => {
  let optionCombination = row.option_combination;
  if (!optionCombination || typeof optionCombination !== 'object' || Array.isArray(optionCombination)) {
    const fallbackOptionName = normalizeOptionName(row.variant_type) || (optionOrder[0] || 'Option');
    const fallbackOptionValue = normalizeOptionValue(row.variant_value);
    optionCombination = fallbackOptionValue ? { [fallbackOptionName]: fallbackOptionValue } : {};
  }

  const normalizedCombination = {};
  for (const optionName of optionOrder) {
    const optionValue = normalizeOptionValue(optionCombination?.[optionName]);
    if (!optionValue) continue;
    normalizedCombination[optionName] = optionValue;
  }

  if (Object.keys(normalizedCombination).length === 0) {
    for (const [rawName, rawValue] of Object.entries(optionCombination || {})) {
      const optionName = normalizeOptionName(rawName);
      const optionValue = normalizeOptionValue(rawValue);
      if (!optionName || !optionValue) continue;
      normalizedCombination[optionName] = optionValue;
    }
  }

  const normalizedOptionOrder = optionOrder.length > 0 ? optionOrder : Object.keys(normalizedCombination);
  const combinationKey = row.combination_key || buildCombinationKey(normalizedCombination, normalizedOptionOrder);

  const storedPrice = Number(row.price);
  const adjustment = Number(row.price_adjustment || 0);
  const resolvedPrice = Number.isFinite(storedPrice)
    ? storedPrice
    : Number(basePrice) + (Number.isFinite(adjustment) ? adjustment : 0);

  return {
    id: row.id,
    product_id: row.product_id,
    option_combination: normalizedCombination,
    combination_key: combinationKey,
    label: formatCombinationLabel(normalizedCombination, normalizedOptionOrder),
    price: Number.isFinite(resolvedPrice) ? resolvedPrice : Number(basePrice),
    stock_quantity: Number.isFinite(Number(row.stock_quantity)) ? Number(row.stock_quantity) : 0,
    image_url: normalizeWhitespace(row.image_url) || null,
    sku: normalizeWhitespace(row.sku) || null,
  };
};

const ensureVariantSchema = async () => {
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS option_combination JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS combination_key VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_variants_product_key
      ON product_variants(product_id, combination_key);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_product_variants_product_combination
      ON product_variants(product_id, combination_key)
      WHERE combination_key IS NOT NULL;
  `);
};

const ensureVariantSchemaReady = ensureVariantSchema().catch((error) => {
  console.error('Failed to ensure variant schema:', error.message);
});

const fetchProductVariantContext = async (productId) => {
  const productResult = await pool.query(
    `SELECT id, price, COALESCE(variant_options, '[]'::jsonb) AS variant_options
     FROM products
     WHERE id = $1`,
    [productId]
  );

  if (productResult.rows.length === 0) {
    return null;
  }

  const product = productResult.rows[0];
  const variantRowsResult = await pool.query(
    `SELECT id, product_id, variant_type, variant_value, price_adjustment, price,
            stock_quantity, sku, image_url, option_combination, combination_key,
            created_at
     FROM product_variants
     WHERE product_id = $1
     ORDER BY created_at ASC, id ASC`,
    [productId]
  );

  return {
    product,
    rows: variantRowsResult.rows,
  };
};

// Get variants for a product
router.get('/product/:productId', async (req, res) => {
  try {
    await ensureVariantSchemaReady;

    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const context = await fetchProductVariantContext(productId);
    if (!context) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const basePrice = Number(context.product.price);
    const storedOptionsResult = normalizeVariantOptions(context.product.variant_options || []);
    const derivedOptions = deriveOptionsFromRows(context.rows);
    const options = storedOptionsResult.value && storedOptionsResult.value.length > 0
      ? storedOptionsResult.value
      : derivedOptions;

    const optionOrder = options.map((option) => option.name);
    const variants = context.rows.map((row) => mapDbRowToVariant(row, optionOrder, basePrice));

    res.json({
      product_id: productId,
      options,
      variants,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Replace full product variant matrix
router.put('/product/:productId', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureVariantSchemaReady;

    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const productResult = await client.query(
      `SELECT id, price
       FROM products
       WHERE id = $1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = productResult.rows[0];

    const optionsResult = normalizeVariantOptions(req.body?.options);
    if (optionsResult.error) {
      return res.status(400).json({ message: optionsResult.error });
    }

    const options = optionsResult.value;
    const variantRowsResult = normalizeVariantRows({
      variants: req.body?.variants,
      options,
      basePrice: Number(product.price),
    });

    if (variantRowsResult.error) {
      return res.status(400).json({ message: variantRowsResult.error });
    }

    const variantRows = variantRowsResult.value;

    await client.query('BEGIN');

    await client.query(
      `UPDATE products
       SET variant_options = $1::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(options), productId]
    );

    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

    const insertedRows = [];
    for (const row of variantRows) {
      const insertResult = await client.query(
        `INSERT INTO product_variants (
           product_id,
           variant_type,
           variant_value,
           price_adjustment,
           price,
           option_combination,
           combination_key,
           image_url,
           stock_quantity,
           sku,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         )
         RETURNING id, product_id, variant_type, variant_value, price_adjustment,
                   price, stock_quantity, sku, image_url, option_combination, combination_key`,
        [
          productId,
          row.variant_type,
          row.variant_value,
          row.price_adjustment,
          row.price,
          JSON.stringify(row.option_combination),
          row.combination_key,
          row.image_url,
          row.stock_quantity,
          row.sku,
        ]
      );

      insertedRows.push(insertResult.rows[0]);
    }

    await client.query('COMMIT');

    const optionOrder = options.map((option) => option.name);
    const variants = insertedRows.map((row) => mapDbRowToVariant(row, optionOrder, Number(product.price)));

    res.json({
      message: 'Product variants saved successfully',
      product_id: productId,
      options,
      variants,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// Add variant
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await ensureVariantSchemaReady;

    const {
      product_id,
      variant_type,
      variant_value,
      price_adjustment,
      additional_price,
      price,
      stock_quantity,
      sku,
      image_url,
      option_combination,
    } = req.body;

    const productId = Number.parseInt(String(product_id), 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Invalid product_id' });
    }

    const productResult = await pool.query('SELECT price FROM products WHERE id = $1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const basePrice = Number(productResult.rows[0].price);
    const optionName = normalizeOptionName(variant_type) || 'Option';
    const optionValue = normalizeOptionValue(variant_value);
    const optionCombination = (option_combination && typeof option_combination === 'object' && !Array.isArray(option_combination))
      ? option_combination
      : { [optionName]: optionValue || 'Default' };

    const optionOrder = Object.keys(optionCombination);
    const normalizedOptionCombination = {};
    for (const name of optionOrder) {
      const normalizedName = normalizeOptionName(name);
      const normalizedValue = normalizeOptionValue(optionCombination[name]);
      if (!normalizedName || !normalizedValue) continue;
      normalizedOptionCombination[normalizedName] = normalizedValue;
    }

    if (Object.keys(normalizedOptionCombination).length === 0) {
      return res.status(400).json({ message: 'Variant combination is required.' });
    }

    const normalizedOrder = Object.keys(normalizedOptionCombination);
    const resolvedPrice = Number(
      price ?? (basePrice + Number(price_adjustment ?? additional_price ?? 0))
    );

    if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      return res.status(400).json({ message: 'Variant price must be greater than 0.' });
    }

    const resolvedStock = Number(stock_quantity ?? 0);
    if (!Number.isInteger(resolvedStock) || resolvedStock < 0) {
      return res.status(400).json({ message: 'Variant stock must be an integer 0 or higher.' });
    }

    const combinationKey = buildCombinationKey(normalizedOptionCombination, normalizedOrder);

    const result = await pool.query(
      `INSERT INTO product_variants (
         product_id, variant_type, variant_value, price_adjustment, price,
         option_combination, combination_key, image_url, stock_quantity, sku,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )
       RETURNING *`,
      [
        productId,
        'combination',
        formatCombinationLabel(normalizedOptionCombination, normalizedOrder),
        Number((resolvedPrice - basePrice).toFixed(2)),
        resolvedPrice,
        JSON.stringify(normalizedOptionCombination),
        combinationKey,
        normalizeWhitespace(image_url) || null,
        resolvedStock,
        normalizeWhitespace(sku) || null,
      ]
    );

    res.status(201).json({
      variant: mapDbRowToVariant(result.rows[0], normalizedOrder, basePrice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update variant
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await ensureVariantSchemaReady;

    const variantId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      return res.status(400).json({ message: 'Invalid variant id' });
    }

    const existingResult = await pool.query(
      'SELECT id, product_id FROM product_variants WHERE id = $1',
      [variantId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const productId = existingResult.rows[0].product_id;
    const productResult = await pool.query('SELECT price FROM products WHERE id = $1', [productId]);
    const basePrice = Number(productResult.rows[0]?.price || 0);

    const {
      variant_type,
      variant_value,
      option_combination,
      price_adjustment,
      additional_price,
      price,
      stock_quantity,
      sku,
      image_url,
    } = req.body;

    const fallbackOptionName = normalizeOptionName(variant_type) || 'Option';
    const fallbackOptionValue = normalizeOptionValue(variant_value) || 'Default';
    const rawCombination = (option_combination && typeof option_combination === 'object' && !Array.isArray(option_combination))
      ? option_combination
      : { [fallbackOptionName]: fallbackOptionValue };

    const normalizedOptionCombination = {};
    for (const [rawName, rawValue] of Object.entries(rawCombination)) {
      const normalizedName = normalizeOptionName(rawName);
      const normalizedValue = normalizeOptionValue(rawValue);
      if (!normalizedName || !normalizedValue) continue;
      normalizedOptionCombination[normalizedName] = normalizedValue;
    }

    if (Object.keys(normalizedOptionCombination).length === 0) {
      return res.status(400).json({ message: 'Variant combination is required.' });
    }

    const optionOrder = Object.keys(normalizedOptionCombination);
    const resolvedPrice = Number(
      price ?? (basePrice + Number(price_adjustment ?? additional_price ?? 0))
    );

    if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      return res.status(400).json({ message: 'Variant price must be greater than 0.' });
    }

    const resolvedStock = Number(stock_quantity ?? 0);
    if (!Number.isInteger(resolvedStock) || resolvedStock < 0) {
      return res.status(400).json({ message: 'Variant stock must be an integer 0 or higher.' });
    }

    const combinationKey = buildCombinationKey(normalizedOptionCombination, optionOrder);
    const result = await pool.query(
      `UPDATE product_variants
       SET variant_type = $1,
           variant_value = $2,
           option_combination = $3::jsonb,
           combination_key = $4,
           price_adjustment = $5,
           price = $6,
           image_url = $7,
           stock_quantity = $8,
           sku = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        'combination',
        formatCombinationLabel(normalizedOptionCombination, optionOrder),
        JSON.stringify(normalizedOptionCombination),
        combinationKey,
        Number((resolvedPrice - basePrice).toFixed(2)),
        resolvedPrice,
        normalizeWhitespace(image_url) || null,
        resolvedStock,
        normalizeWhitespace(sku) || null,
        variantId,
      ]
    );

    res.json({
      variant: mapDbRowToVariant(result.rows[0], optionOrder, basePrice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete variant
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
