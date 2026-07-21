import pool from '../config/database.js';
import { emitStockUpdate, emitLowStockAlert } from '../socket.js';
import { mutateInventory } from '../services/inventory.js';

// Get all inventory with low stock alerts
export const getInventory = async (req, res) => {
  try {
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
      ORDER BY p.stock_quantity ASC, p.name ASC
    `);

    res.json(result.rows.map(product => ({
      ...product,
      stock_quantity: parseInt(product.stock_quantity),
      reserved_stock: parseInt(product.reserved_stock || 0, 10),
      damaged_stock: parseInt(product.damaged_stock || 0, 10),
      low_stock_threshold: parseInt(product.low_stock_threshold),
      price: parseFloat(product.price),
      buying_price: parseFloat(product.buying_price || 0),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null
    })));
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

  const reasonMap = { restock: 'received', returned: 'correction', shrinkage: 'lost', other: 'correction', manual: 'correction' };
  const dbReason = reasonMap[reason] || reason || 'correction';
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
        reason: 'received',
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
