import pool from '../config/database.js';
import { emitStockUpdate, emitLowStockAlert } from '../socket.js';
import { mutateInventory } from '../services/inventory.js';
import { calculateEcommercePrice, resolveStoreSellingPrice } from '../services/catalogPricing.js';

const INVENTORY_STATUSES = new Set(['active', 'inactive', 'discontinued']);
const asOptionalText = (value, maxLength) => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};
const asMoney = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw Object.assign(new Error(`${field} must be a non-negative number.`), { status: 400 });
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
};
const asStock = (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw Object.assign(new Error(`${field} must be a non-negative integer.`), { status: 400 });
  }
  return number;
};
const mapInventoryItem = (product) => {
  const storeSellingPrice = resolveStoreSellingPrice(product) ?? 0;
  return {
    ...product,
    product_name: product.name,
    partNumber: product.part_number,
    store_selling_price: storeSellingPrice,
    ecommerce_price: calculateEcommercePrice(storeSellingPrice),
    cost_price: Number(product.buying_price || 0),
    quantity: Number(product.stock_quantity || 0),
    minimum_stock: Number(product.low_stock_threshold || 0),
    box_location: product.box_location || product.box_number || null,
    stock_quantity: Number(product.stock_quantity || 0),
    reserved_stock: Number(product.reserved_stock || 0),
    damaged_stock: Number(product.damaged_stock || 0),
    low_stock_threshold: Number(product.low_stock_threshold || 0),
    buying_price: Number(product.buying_price || 0),
    price: storeSellingPrice,
    sale_price: product.sale_price == null ? null : Number(product.sale_price),
  };
};

const normalizeInventoryInput = (body, { partial = false } = {}) => {
  const productName = asOptionalText(body.product_name ?? body.name, 255);
  const partNumber = asOptionalText(body.part_number ?? body.partNumber, 100)?.toUpperCase() || null;
  if (!partial && !productName) throw Object.assign(new Error('Product name is required.'), { status: 400 });
  if (!partial && !partNumber) throw Object.assign(new Error('Part number is required.'), { status: 400 });
  const inventoryStatus = String(body.status ?? body.inventory_status ?? 'active').trim().toLowerCase();
  if (!INVENTORY_STATUSES.has(inventoryStatus)) {
    throw Object.assign(new Error('Status must be active, inactive, or discontinued.'), { status: 400 });
  }
  const categoryValue = body.category_id ?? body.categoryId;
  const categoryId = categoryValue === '' || categoryValue == null ? null : Number(categoryValue);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    throw Object.assign(new Error('Category is invalid.'), { status: 400 });
  }
  return {
    partNumber,
    productName,
    brand: asOptionalText(body.brand, 100),
    motorcycleModel: asOptionalText(body.motorcycle_model ?? body.motorcycleModel, 160),
    categoryId,
    storeSellingPrice: asMoney(body.store_selling_price ?? body.storeSellingPrice ?? body.price, 'Store selling price'),
    costPrice: asMoney(body.cost_price ?? body.buying_price ?? body.costPrice ?? 0, 'Cost price'),
    quantity: partial ? undefined : asStock(body.quantity ?? body.stock_quantity ?? 0, 'Quantity'),
    minimumStock: asStock(body.minimum_stock ?? body.low_stock_threshold ?? 0, 'Minimum stock'),
    boxLocation: asOptionalText(body.box_location ?? body.boxNumber ?? body.box_number, 100),
    description: asOptionalText(body.description, 10000),
    inventoryStatus,
  };
};

export const STOCK_ADJUSTMENT_REASONS = Object.freeze({
  add: Object.freeze(['restocking', 'returned', 'correction_add', 'supplier_delivery', 'initial_stock']),
  remove: Object.freeze(['damaged', 'expired', 'correction_remove', 'sold_adjustment', 'lost']),
});

export const validateStockAdjustmentReason = (quantityChange, reason) => {
  const type = Number(quantityChange) > 0 ? 'add' : Number(quantityChange) < 0 ? 'remove' : null;
  const normalizedReason = String(reason || '').trim().toLowerCase();
  if (!type) return { valid: false, type, reason: normalizedReason };
  return {
    valid: STOCK_ADJUSTMENT_REASONS[type].includes(normalizedReason),
    type,
    reason: normalizedReason,
  };
};

const invalidReasonMessage = (type) => (
  `Invalid ${type.toUpperCase()} stock reason. Allowed reasons: ${STOCK_ADJUSTMENT_REASONS[type].join(', ')}.`
);

// Get all inventory with low stock alerts
export const getInventory = async (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    const result = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name,
        CASE 
          WHEN p.stock_quantity = 0 THEN 'out_of_stock'
          WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
          ELSE 'in_stock'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ($1 = '' OR
        p.part_number ILIKE $2 OR p.name ILIKE $2 OR p.brand ILIKE $2 OR
        p.motorcycle_model ILIKE $2 OR c.name ILIKE $2 OR p.box_location ILIKE $2 OR
        p.barcode ILIKE $2 OR p.sku ILIKE $2)
      ORDER BY
        CASE WHEN $1 <> '' AND LOWER(p.part_number) LIKE LOWER($1) || '%' THEN 0 ELSE 1 END,
        p.stock_quantity ASC, p.name ASC
      LIMIT 500
    `, [search, `%${search}%`]);

    res.json(result.rows.map(mapInventoryItem));
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get low stock products
export const getLowStockProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.stock_quantity <= p.low_stock_threshold
      ORDER BY p.stock_quantity ASC
    `);

    res.json({
      count: result.rows.length,
      products: result.rows.map(product => ({
        ...product,
        stock_quantity: parseInt(product.stock_quantity),
        reserved_stock: parseInt(product.reserved_stock || 0, 10),
        damaged_stock: parseInt(product.damaged_stock || 0, 10),
        low_stock_threshold: parseInt(product.low_stock_threshold),
        price: parseFloat(product.price),
        buying_price: parseFloat(product.buying_price || 0)
      }))
    });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update product stock
export const updateStock = async (req, res) => {
  const { productId } = req.params;
  const { quantity, adjustment_type, reason } = req.body;

  if (!Number.isInteger(quantity) || quantity < 0 || !['set', 'add', 'subtract'].includes(adjustment_type)) {
    return res.status(400).json({ message: 'quantity must be a non-negative integer and adjustment_type must be set, add, or subtract' });
  }
  if (['add', 'subtract'].includes(adjustment_type)) {
    if (quantity === 0) {
      return res.status(400).json({ message: 'ADD and REMOVE stock quantities must be greater than zero.' });
    }
    const reasonValidation = validateStockAdjustmentReason(adjustment_type === 'add' ? quantity : -quantity, reason);
    if (!reasonValidation.valid) {
      return res.status(400).json({
        message: invalidReasonMessage(reasonValidation.type),
        code: 'INVALID_STOCK_ADJUSTMENT_REASON',
        allowed_reasons: STOCK_ADJUSTMENT_REASONS[reasonValidation.type],
      });
    }
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get current stock
    const productResult = await client.query(
      'SELECT id, name, stock_quantity, reserved_stock FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentStock = parseInt(productResult.rows[0].stock_quantity);
    let newStock;

    if (adjustment_type === 'set') {
      newStock = quantity;
    } else if (adjustment_type === 'add') {
      newStock = currentStock + quantity;
    } else if (adjustment_type === 'subtract') {
      newStock = currentStock - quantity;
    } else {
      newStock = quantity; // Default to set
    }

    // Ensure stock doesn't go negative
    if (newStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stock cannot be negative' });
    }

    if (newStock < Number(productResult.rows[0].reserved_stock || 0)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Stock cannot be set below currently reserved stock.' });
    }

    // Update stock
    const updateResult = await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [newStock, productId]
    );

    await client.query(
      `INSERT INTO stock_movements (product_id, quantity_delta, stock_before, stock_after, reason, reference_type, created_by, metadata)
       VALUES ($1,$2,$3,$4,'adjustment','manual',$5,$6::jsonb)`,
      [productId, newStock - currentStock, currentStock, newStock, req.user.id, JSON.stringify({ adjustment_type, reason: reason || null })]
    );
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_data, after_data, metadata
       ) VALUES ($1,'inventory.adjust','product',$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [req.user.id, String(productId), req.clientIp, req.clientUa,
        JSON.stringify({ stock_quantity: currentStock }),
        JSON.stringify({ stock_quantity: newStock }),
        JSON.stringify({ adjustment_type, reason: reason || null })]
    );

    await client.query('COMMIT');

    const updatedProduct = updateResult.rows[0];
    const stockData = {
      product_id: updatedProduct.id,
      name: updatedProduct.name,
      stock_quantity: parseInt(updatedProduct.stock_quantity),
      previous_stock: currentStock,
      adjustment: newStock - currentStock
    };

    // Emit real-time stock update
    emitStockUpdate(stockData);

    // Check for low stock alert
    if (newStock <= parseInt(updatedProduct.low_stock_threshold || 5)) {
      emitLowStockAlert({
        id: updatedProduct.id,
        name: updatedProduct.name,
        stock_quantity: newStock,
        low_stock_threshold: parseInt(updatedProduct.low_stock_threshold || 5)
      });
    }

    res.json({
      message: 'Stock updated successfully',
      product: {
        ...updatedProduct,
        stock_quantity: parseInt(updatedProduct.stock_quantity),
        previous_stock: currentStock,
        adjustment: newStock - currentStock
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update stock error:', error);
    res.status(500).json({ message: 'Failed to update stock' });
  } finally {
    client.release();
  }
};

export const findInventoryItem = async (req, res) => {
  const code = String(req.query.code || req.query.q || '').trim();
  if (!code) return res.status(400).json({ message: 'Part number or barcode is required.' });
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE LOWER(p.part_number) = LOWER($1)
           OR LOWER(COALESCE(p.barcode, '')) = LOWER($1)
           OR LOWER(COALESCE(p.sku, '')) = LOWER($1)
        ORDER BY CASE WHEN LOWER(p.part_number) = LOWER($1) THEN 0 ELSE 1 END
        LIMIT 1`,
      [code]
    );
    if (!result.rowCount) {
      return res.status(404).json({
        message: 'Part Number Not Found',
        code: 'PART_NUMBER_NOT_FOUND',
        can_create: true,
        part_number: code.toUpperCase(),
      });
    }
    return res.json(mapInventoryItem(result.rows[0]));
  } catch (error) {
    console.error('Inventory lookup failed:', { code: error.code, message: error.message });
    return res.status(500).json({ message: 'Inventory lookup failed.' });
  }
};

export const createInventoryItem = async (req, res) => {
  let client;
  try {
    const item = normalizeInventoryInput(req.body || {});
    client = await pool.connect();
    await client.query('BEGIN');
    const duplicate = await client.query(
      `SELECT id FROM products WHERE LOWER(part_number) = LOWER($1) LIMIT 1`,
      [item.partNumber]
    );
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Part number already exists.', code: 'DUPLICATE_PART_NUMBER' });
    }
    // Categories can be deleted or become stale while the inventory form is open.
    // Validate the selected id before inserting so this normal client error is not
    // surfaced as a generic 500 foreign-key failure.
    if (item.categoryId !== null) {
      const category = await client.query('SELECT id FROM categories WHERE id = $1 LIMIT 1', [item.categoryId]);
      if (!category.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Selected category no longer exists. Please choose another category.', code: 'CATEGORY_NOT_FOUND' });
      }
    }
    const result = await client.query(
      `INSERT INTO products (
         part_number, name, brand, motorcycle_model, category_id,
         store_selling_price, price, buying_price, stock_quantity,
         low_stock_threshold, box_location, box_number, description,
         inventory_status, status, is_deleted
       ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$10,$11,$12,'draft',false)
       RETURNING *`,
      [item.partNumber, item.productName, item.brand, item.motorcycleModel, item.categoryId,
        item.storeSellingPrice, item.costPrice, item.quantity, item.minimumStock,
        item.boxLocation, item.description, item.inventoryStatus]
    );
    const created = result.rows[0];
    if (item.quantity > 0) {
      await client.query(
        `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, adjusted_by, status)
         VALUES ($1,$2,'initial_stock','Initial inventory quantity',$3,'approved')`,
        [created.id, item.quantity, req.user.id]
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, quantity_delta, stock_before, stock_after, reason,
           reference_type, created_by, metadata
         ) VALUES ($1,$2,0,$2,'stock_received','inventory_create',$3,$4::jsonb)`,
        [created.id, item.quantity, req.user.id, JSON.stringify({ reason: 'initial_stock' })]
      );
    }
    await client.query('COMMIT');
    emitStockUpdate({ product_id: created.id, name: created.name, stock_quantity: item.quantity, previous_stock: 0, adjustment: item.quantity });
    return res.status(201).json({ message: 'Inventory item created.', item: mapInventoryItem(created) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Create inventory item failed:', { code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ message: 'Part number already exists.', code: 'DUPLICATE_PART_NUMBER' });
    if (error.code === '23503' && String(error.constraint || '').toLowerCase().includes('category')) {
      return res.status(400).json({ message: 'Selected category no longer exists. Please choose another category.', code: 'CATEGORY_NOT_FOUND' });
    }
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Inventory item could not be created.' });
  } finally {
    if (client) client.release();
  }
};

export const updateInventoryItem = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ message: 'Invalid inventory item ID.' });
    const item = normalizeInventoryInput(req.body || {}, { partial: true });
    if (!item.productName || !item.partNumber) return res.status(400).json({ message: 'Product name and part number are required.' });
    const result = await pool.query(
      `UPDATE products SET
         part_number=$1, name=$2, brand=$3, motorcycle_model=$4, category_id=$5,
         store_selling_price=$6, price=$6, buying_price=$7, low_stock_threshold=$8,
         box_location=$9, box_number=$9, description=$10, inventory_status=$11, updated_at=NOW()
       WHERE id=$12 AND NOT EXISTS (
         SELECT 1 FROM products duplicate
          WHERE duplicate.id <> $12 AND LOWER(duplicate.part_number) = LOWER($1)
       ) RETURNING *`,
      [item.partNumber, item.productName, item.brand, item.motorcycleModel, item.categoryId,
        item.storeSellingPrice, item.costPrice, item.minimumStock, item.boxLocation,
        item.description, item.inventoryStatus, productId]
    );
    if (!result.rowCount) {
      const exists = await pool.query('SELECT 1 FROM products WHERE id=$1', [productId]);
      return res.status(exists.rowCount ? 409 : 404).json({
        message: exists.rowCount ? 'Part number already exists.' : 'Inventory item not found.',
      });
    }
    return res.json({ message: 'Inventory item updated.', item: mapInventoryItem(result.rows[0]) });
  } catch (error) {
    console.error('Update inventory item failed:', { code: error.code, message: error.message });
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Inventory item could not be updated.' });
  }
};

export const getStockMovements = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  try {
    const params = [limit, (page - 1) * limit];
    const filter = Number.isInteger(productId) && productId > 0 ? `WHERE sm.product_id = $3` : '';
    if (filter) params.push(productId);
    const result = await pool.query(
      `SELECT sm.*, p.name AS product_name, pv.variant_value, u.name AS created_by_name,
              COUNT(*) OVER()::int AS total_count
       FROM stock_movements sm JOIN products p ON p.id = sm.product_id
       LEFT JOIN product_variants pv ON pv.id = sm.variant_id
       LEFT JOIN users u ON u.id = sm.created_by
       ${filter} ORDER BY sm.created_at DESC, sm.id DESC LIMIT $1 OFFSET $2`,
      params
    );
    return res.json({ data: result.rows, pagination: { page, limit, total: result.rows[0]?.total_count || 0 } });
  } catch (error) {
    console.error('Get stock movements failed:', error);
    return res.status(500).json({ message: 'Stock movements could not be loaded.' });
  }
};

// Get stock adjustment history
export const getStockAdjustments = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sa.*, p.name as product_name
      FROM stock_adjustments sa
      LEFT JOIN products p ON sa.product_id = p.id
      ORDER BY sa.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get stock adjustments error:', error);
    // If table doesn't exist, return empty array
    res.json([]);
  }
};

// Create a stock adjustment (add/remove stock with reason)
export const createStockAdjustment = async (req, res) => {
  const { product_id, variant_id = null, quantity_change, reason, note } = req.body;
  if (!product_id || !Number.isInteger(quantity_change) || quantity_change === 0) {
    return res.status(400).json({ message: 'product_id and a non-zero integer quantity_change are required' });
  }

  const reasonValidation = validateStockAdjustmentReason(quantity_change, reason);
  if (!reasonValidation.valid) {
    return res.status(400).json({
      message: invalidReasonMessage(reasonValidation.type),
      code: 'INVALID_STOCK_ADJUSTMENT_REASON',
      allowed_reasons: STOCK_ADJUSTMENT_REASONS[reasonValidation.type],
    });
  }

  const dbReason = reasonValidation.reason;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const productResult = await client.query(
      'SELECT id, name, stock_quantity, reserved_stock, low_stock_threshold FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = productResult.rows[0];
    let variant = null;
    if (variant_id) {
      const variantResult = await client.query(
        `SELECT id, product_id, stock_quantity, reserved_stock, sku
         FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE`,
        [variant_id, product_id]
      );
      if (variantResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Product variant not found' });
      }
      variant = variantResult.rows[0];
    }

    const currentStock = parseInt(variant?.stock_quantity ?? product.stock_quantity, 10);
    const newStock = currentStock + quantity_change;
    if (newStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stock cannot go below zero' });
    }
    if (newStock < Number(variant?.reserved_stock ?? product.reserved_stock ?? 0)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Stock cannot be reduced below reserved stock.' });
    }

    if (variant) {
      await client.query(
        'UPDATE product_variants SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStock, variant.id]
      );
    } else {
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStock, product_id]
      );
    }

    const adjustmentResult = await client.query(
      `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, adjusted_by, status)
       VALUES ($1, $2, $3, $4, $5, 'approved') RETURNING *`,
      [product_id, quantity_change, dbReason, note || '', req.user.id]
    );
    const adjustment = adjustmentResult.rows[0];
    const movementResult = await client.query(
      `INSERT INTO stock_movements (
         product_id, variant_id, quantity_delta, stock_before, stock_after,
         reason, reference_type, reference_id, created_by, metadata
       ) VALUES ($1, $2, $3, $4, $5, 'manual_adjustment', 'stock_adjustment', $6, $7, $8::jsonb)
       RETURNING *`,
      [product_id, variant?.id || null, quantity_change, currentStock, newStock, adjustment.id, req.user.id,
        JSON.stringify({ reason: dbReason, note: note || '', variant_sku: variant?.sku || null })]
    );
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, action, entity_type, entity_id, ip_address, user_agent,
         before_data, after_data, metadata
       ) VALUES ($1, 'inventory.adjust', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
      [req.user.id, variant ? 'product_variant' : 'product', String(variant?.id || product_id),
        req.clientIp, req.clientUa, JSON.stringify({ stock_quantity: currentStock }),
        JSON.stringify({ stock_quantity: newStock }),
        JSON.stringify({ product_id, variant_id: variant?.id || null, adjustment_id: adjustment.id, reason: dbReason, note: note || '' })]
    );
    await client.query('COMMIT');

    const stockData = { product_id, variant_id: variant?.id || null, name: product.name, stock_quantity: newStock, previous_stock: currentStock, adjustment: quantity_change };
    emitStockUpdate(stockData);
    if (!variant && newStock <= parseInt(product.low_stock_threshold || 5, 10)) {
      emitLowStockAlert({ id: product_id, name: product.name, stock_quantity: newStock, low_stock_threshold: parseInt(product.low_stock_threshold || 5, 10) });
    }
    return res.json({
      message: 'Stock adjusted successfully',
      product: stockData,
      adjustment,
      movement: movementResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create stock adjustment error:', error);
    return res.status(500).json({ message: 'Failed to adjust stock' });
  } finally {
    client.release();
  }
};

// Bulk stock update
export const bulkUpdateStock = async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: 'Updates array is required' });
  }
  if (updates.length > 500) return res.status(400).json({ message: 'A maximum of 500 updates is allowed.' });

  const client = await pool.connect();
  const results = [];
  
  try {
    await client.query('BEGIN');

    const orderedUpdates = [...updates].sort((a, b) =>
      Number(a.product_id) - Number(b.product_id) || Number(a.variant_id || 0) - Number(b.variant_id || 0));
    for (const update of orderedUpdates) {
      const result = await mutateInventory(client, {
        productId: Number(update.product_id),
        variantId: update.variant_id == null ? null : Number(update.variant_id),
        quantity: Number(update.quantity),
        adjustmentType: update.adjustment_type,
        reason: 'bulk_adjustment',
        referenceType: 'bulk_update',
        actorId: req.user.id,
        ipAddress: req.clientIp,
        userAgent: req.clientUa,
        metadata: { notes: String(update.reason || '').slice(0, 500) },
      });
      results.push({ ...result, success: true });
    }

    await client.query('COMMIT');

    // Emit stock updates for all successful changes
    for (const r of results.filter(r => r.success)) {
      emitStockUpdate({ product_id: r.product_id, stock_quantity: r.new_stock });
    }

    return res.json({
      message: 'Bulk update completed',
      results,
      success_count: results.length,
      failed_count: 0
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk update stock error:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to update stock' });
  } finally {
    client.release();
  }
};

// Batch receive stock (barcode scanning workflow)
export const batchReceiveStock = async (req, res) => {
  const { items, notes } = req.body;
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items array is required and cannot be empty' });
  }
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(idempotencyKey)) {
    return res.status(400).json({ message: 'A valid Idempotency-Key header is required.' });
  }
  if (items.length > 500) return res.status(400).json({ message: 'A maximum of 500 items is allowed.' });

  for (const item of items) {
    if (!Number.isInteger(Number(item.product_id)) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
      return res.status(400).json({ message: 'Each item must have a valid product_id and quantity >= 1' });
    }
  }

  const client = await pool.connect();
  const results = [];

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inventory-receive:${idempotencyKey}`]);
    const prior = await client.query(
      `SELECT metadata->'result' AS result FROM audit_logs
       WHERE action='inventory.batch_receive' AND metadata->>'idempotency_key'=$1
       ORDER BY id DESC LIMIT 1`,
      [idempotencyKey]
    );
    if (prior.rows[0]?.result) {
      await client.query('COMMIT');
      return res.json({ ...prior.rows[0].result, idempotent_replay: true });
    }

    const orderedItems = [...items].sort((a, b) =>
      Number(a.product_id) - Number(b.product_id) || Number(a.variant_id || 0) - Number(b.variant_id || 0));
    for (const item of orderedItems) {
      const result = await mutateInventory(client, {
        productId: Number(item.product_id),
        variantId: item.variant_id == null ? null : Number(item.variant_id),
        quantity: Number(item.quantity),
        adjustmentType: 'add',
        reason: 'supplier_delivery',
        referenceType: 'batch_receive',
        actorId: req.user.id,
        ipAddress: req.clientIp,
        userAgent: req.clientUa,
        metadata: { notes: String(notes || 'Batch receive').slice(0, 1000), idempotency_key: idempotencyKey },
        recordAdjustment: true,
      });
      results.push({ ...result, success: true, quantity_added: Number(item.quantity) });
    }

    const response = {
      message: 'Stock received successfully',
      results,
      total_items: items.length,
      success_count: results.length,
      failed_count: 0
    };
    await client.query(
      `INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata)
       VALUES ($1,'inventory.batch_receive','inventory_batch',$2,$3,$4,$5::jsonb)`,
      [req.user.id, idempotencyKey, req.clientIp, req.clientUa,
        JSON.stringify({ idempotency_key: idempotencyKey, result: response })]
    );
    await client.query('COMMIT');

    // Emit real-time updates
    for (const r of results.filter(r => r.success)) {
      emitStockUpdate({ product_id: r.product_id, name: r.name, stock_quantity: r.new_stock, previous_stock: r.previous_stock, adjustment: r.quantity_added });

      const threshold = r.low_stock_threshold;
      if (r.new_stock <= threshold) {
        emitLowStockAlert({ id: r.product_id, name: r.name, stock_quantity: r.new_stock, low_stock_threshold: threshold });
      }
    }

    return res.json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Batch receive stock error:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to receive stock' });
  } finally {
    client.release();
  }
};
