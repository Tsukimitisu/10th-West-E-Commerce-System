import crypto from 'crypto';
import pool from '../config/database.js';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';

const MAX_ITEMS = 100;
const PAGE_SIZE = 25;
const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'gcash']);
const PRODUCT_IMAGE_FALLBACK = '/images/product-fallback.svg';

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = (value) => round(Number(value || 0));
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const normalizeCartItems = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    throw fail(400, `A POS cart must contain between 1 and ${MAX_ITEMS} items.`, 'POS_CART_INVALID');
  }

  const grouped = new Map();
  for (const raw of rawItems) {
    const productId = Number(raw.product_id ?? raw.productId);
    const variantValue = raw.variant_id ?? raw.variantId;
    const variantId = variantValue == null || variantValue === '' ? null : Number(variantValue);
    const quantity = Number(raw.quantity);
    if (
      !Number.isInteger(productId) || productId <= 0
      || (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0))
      || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100
    ) {
      throw fail(400, 'Every POS item requires a valid product, optional variant, and quantity from 1 to 100.', 'POS_ITEM_INVALID');
    }
    const key = `${productId}:${variantId || 0}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      product_id: productId,
      variant_id: variantId,
      quantity: (existing?.quantity || 0) + quantity,
    });
  }

  const items = Array.from(grouped.values());
  if (items.some((item) => item.quantity > 100)) {
    throw fail(400, 'The combined quantity for one POS item cannot exceed 100.', 'POS_QUANTITY_INVALID');
  }
  return items;
};

const hasPermission = async (client, user, permissionName) => {
  if (['owner', 'super_admin', 'admin'].includes(user?.role)) return true;
  const result = await client.query(
    `SELECT COALESCE(
       (SELECT granted FROM user_permissions up
        JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = $1 AND p.name = $3),
       EXISTS(
         SELECT 1 FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role = $2 AND p.name = $3
       ),
       false
     ) AS allowed`,
    [user.id, user.role, permissionName],
  );
  return Boolean(result.rows[0]?.allowed);
};

const resolvePromotion = async (client, code, subtotal, user) => {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  if (!(await hasPermission(client, user, 'pos.discount'))) {
    throw fail(403, 'Your account cannot apply POS discounts.', 'POS_DISCOUNT_FORBIDDEN');
  }

  const result = await client.query(
    `SELECT id, code, type, value, min_purchase, max_discount, max_uses, used_count
     FROM discounts
     WHERE UPPER(code) = $1
       AND is_active = true
       AND deleted_at IS NULL
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (expires_at IS NULL OR expires_at >= NOW())
       AND (max_uses IS NULL OR used_count < max_uses)
     FOR UPDATE`,
    [normalized],
  );
  const promotion = result.rows[0];
  if (!promotion) throw fail(400, 'This promotion is unavailable or expired.', 'POS_PROMOTION_INVALID');
  if (subtotal < Number(promotion.min_purchase || 0)) {
    throw fail(400, `This promotion requires a minimum purchase of ₱${money(promotion.min_purchase).toFixed(2)}.`, 'POS_PROMOTION_MINIMUM');
  }

  let discount = promotion.type === 'percentage'
    ? subtotal * (Number(promotion.value) / 100)
    : Number(promotion.value);
  if (promotion.max_discount != null) discount = Math.min(discount, Number(promotion.max_discount));
  discount = Math.min(subtotal, money(discount));
  return { ...promotion, discount_amount: discount };
};

const validateCart = async (client, rawItems, { lock = false, deduct = false } = {}) => {
  const items = normalizeCartItems(rawItems);
  const snapshots = [];
  let subtotal = 0;

  for (const item of items) {
    const productResult = await client.query(
      `SELECT p.id, p.name, p.price, p.buying_price, p.sale_price, p.is_on_sale, p.sku, p.barcode,
              p.image, p.stock_quantity, p.reserved_stock, p.variant_options
       FROM products p
       WHERE p.id = $1 AND p.status = 'active' AND COALESCE(p.is_deleted, false) = false
       ${lock ? 'FOR UPDATE' : ''}`,
      [item.product_id],
    );
    const product = productResult.rows[0];
    if (!product) throw fail(400, `Product #${item.product_id} is unavailable.`, 'POS_PRODUCT_UNAVAILABLE');

    let variant = null;
    let available;
    let unitPrice = Number(product.is_on_sale && product.sale_price ? product.sale_price : product.price);
    if (item.variant_id) {
      const variantResult = await client.query(
        `SELECT id, product_id, variant_type, variant_value, option_combination, price,
                price_adjustment, sku, image_url, stock_quantity, reserved_stock
         FROM product_variants
         WHERE id = $1 AND product_id = $2
         ${lock ? 'FOR UPDATE' : ''}`,
        [item.variant_id, item.product_id],
      );
      variant = variantResult.rows[0];
      if (!variant) throw fail(400, `The selected variant for ${product.name} is invalid.`, 'POS_VARIANT_INVALID');
      unitPrice = variant.price != null ? Number(variant.price) : unitPrice + Number(variant.price_adjustment || 0);
      available = Math.max(0, Number(variant.stock_quantity || 0) - Number(variant.reserved_stock || 0));
    } else {
      const variantCount = await client.query('SELECT COUNT(*)::int AS count FROM product_variants WHERE product_id = $1', [item.product_id]);
      if (Number(variantCount.rows[0]?.count || 0) > 0) {
        throw fail(400, `Choose a variant for ${product.name}.`, 'POS_VARIANT_REQUIRED');
      }
      available = Math.max(0, Number(product.stock_quantity || 0) - Number(product.reserved_stock || 0));
    }

    if (available < item.quantity) {
      throw fail(409, `${product.name} has only ${available} available.`, 'POS_INSUFFICIENT_STOCK');
    }

    let stockBefore = available;
    let stockAfter = available;
    if (deduct) {
      const table = variant ? 'product_variants' : 'products';
      const stockResult = await client.query(
        `UPDATE ${table}
         SET stock_quantity = stock_quantity - $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity - reserved_stock >= $1
         RETURNING stock_quantity + $1 AS before, stock_quantity AS after`,
        [item.quantity, variant?.id || product.id],
      );
      if (!stockResult.rowCount) {
        throw fail(409, `${product.name} stock changed. Revalidate the cart and try again.`, 'POS_STOCK_CHANGED');
      }
      stockBefore = Number(stockResult.rows[0].before);
      stockAfter = Number(stockResult.rows[0].after);
    }

    const lineTotal = money(unitPrice * item.quantity);
    subtotal = money(subtotal + lineTotal);
    snapshots.push({
      ...item,
      product_name: product.name,
      sku: variant?.sku || product.sku || null,
      barcode: product.barcode || null,
      variant_name: variant ? `${variant.variant_type}: ${variant.variant_value}` : null,
      unit_price: money(unitPrice),
      unit_cost_snapshot: product.buying_price == null ? null : money(product.buying_price),
      line_total: lineTotal,
      image: variant?.image_url || product.image || PRODUCT_IMAGE_FALLBACK,
      available_stock: available,
      stock_before: stockBefore,
      stock_after: stockAfter,
    });
  }
  return { items: snapshots, subtotal };
};

const buildReceipt = async (client, orderId) => {
  const orderResult = await client.query(
    `SELECT o.*, u.name AS cashier_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.cashier_id
     WHERE o.id = $1 AND o.source = 'pos'`,
    [orderId],
  );
  if (!orderResult.rows[0]) throw fail(404, 'POS order not found.', 'POS_ORDER_NOT_FOUND');
  const itemResult = await client.query(
    `SELECT id, product_id, variant_id, product_name, product_price, quantity,
            sku_snapshot, variant_name_snapshot, image_snapshot,
            ROUND(product_price * quantity, 2) AS line_total
     FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId],
  );
  const paymentResult = await client.query(
    `SELECT id, provider, method, status, amount, currency, reference, paid_at
     FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`,
    [orderId],
  );
  const order = orderResult.rows[0];
  return {
    id: order.id,
    order_id: order.id,
    receipt_number: order.receipt_number || `POS-${String(order.id).padStart(8, '0')}`,
    source: order.source,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    payment_reference: order.payment_reference,
    cashier_id: order.cashier_id,
    cashier_name: order.cashier_name || 'Staff',
    subtotal_amount: money(order.subtotal_amount),
    discount_amount: money(order.discount_amount),
    tax_amount: money(order.tax_amount),
    total_amount: money(order.total_amount),
    amount_tendered: money(order.amount_tendered),
    change_due: money(order.change_due),
    promo_code_used: order.promo_code_used,
    created_at: order.created_at,
    voided_at: order.voided_at,
    void_reason: order.void_reason,
    items: itemResult.rows.map((item) => ({
      ...item,
      product_price: money(item.product_price),
      line_total: money(item.line_total),
    })),
    payment: paymentResult.rows[0] ? {
      ...paymentResult.rows[0],
      amount: money(paymentResult.rows[0].amount),
    } : null,
  };
};

const logActivity = (client, req, action, entityId, details = {}) => client.query(
  `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
   VALUES ($1, $2, 'order', $3, $4::jsonb, $5, $6)`,
  [req.user.id, action, entityId, JSON.stringify(details), req.ip || null, req.get('user-agent') || null],
);

export const getPosProducts = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const categoryId = Number(req.query.category_id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
    const values = [`%${search}%`, Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null, limit];
    const productsResult = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.sku, p.barcode, p.part_number, p.price, p.sale_price,
              p.is_on_sale, p.image, p.category_id, c.name AS category_name,
              p.stock_quantity, p.reserved_stock, p.status, p.low_stock_threshold
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       WHERE p.status = 'active'
         AND COALESCE(p.is_deleted, false) = false
         AND ($2::int IS NULL OR p.category_id = $2)
         AND ($1 = '%%' OR p.name ILIKE $1 OR p.sku ILIKE $1 OR p.barcode ILIKE $1
              OR p.part_number ILIKE $1 OR c.name ILIKE $1 OR pv.sku ILIKE $1)
       ORDER BY p.name
       LIMIT $3`,
      values,
    );
    const ids = productsResult.rows.map((product) => product.id);
    const variantsResult = ids.length
      ? await pool.query(
        `SELECT id, product_id, variant_type, variant_value, option_combination, price,
                price_adjustment, sku, image_url, stock_quantity, reserved_stock
         FROM product_variants WHERE product_id = ANY($1::int[]) ORDER BY product_id, id`,
        [ids],
      )
      : { rows: [] };
    const variants = new Map();
    for (const variant of variantsResult.rows) {
      if (!variants.has(variant.product_id)) variants.set(variant.product_id, []);
      variants.get(variant.product_id).push({
        ...variant,
        price: variant.price == null ? null : money(variant.price),
        price_adjustment: money(variant.price_adjustment),
        stock_quantity: Number(variant.stock_quantity || 0),
        available_stock: Math.max(0, Number(variant.stock_quantity || 0) - Number(variant.reserved_stock || 0)),
      });
    }
    return res.json({
      products: productsResult.rows.map((product) => ({
        ...product,
        price: money(product.price),
        sale_price: product.sale_price == null ? null : money(product.sale_price),
        stock_quantity: Number(product.stock_quantity || 0),
        available_stock: Math.max(0, Number(product.stock_quantity || 0) - Number(product.reserved_stock || 0)),
        image: product.image || PRODUCT_IMAGE_FALLBACK,
        variants: variants.get(product.id) || [],
      })),
    });
  } catch (error) {
    console.error('POS product search failed:', error);
    return res.status(500).json({ message: 'POS products could not be loaded.', code: 'POS_PRODUCTS_FAILED' });
  }
};

export const getPosCapabilities = async (req, res) => {
  const client = await pool.connect();
  try {
    const [canDiscount, canVoid] = await Promise.all([
      hasPermission(client, req.user, 'pos.discount'),
      hasPermission(client, req.user, 'pos.void'),
    ]);
    return res.json({
      role: req.user.role,
      can_access: true,
      can_discount: canDiscount,
      can_void: canVoid,
    });
  } finally {
    client.release();
  }
};

export const validatePosCart = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cart = await validateCart(client, req.body?.items, { lock: true });
    const promotion = await resolvePromotion(client, req.body?.promotion_code, cart.subtotal, req.user);
    const discountAmount = promotion?.discount_amount || 0;
    const total = money(cart.subtotal - discountAmount);
    await client.query('ROLLBACK');
    return res.json({
      valid: true,
      items: cart.items,
      subtotal_amount: cart.subtotal,
      discount_amount: discountAmount,
      tax_amount: money(total - (total / 1.12)),
      total_amount: total,
      promotion: promotion ? { code: promotion.code, discount_amount: discountAmount } : null,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.status || 500).json({
      valid: false,
      message: error.status ? error.message : 'The POS cart could not be validated.',
      code: error.code || 'POS_VALIDATION_FAILED',
    });
  } finally {
    client.release();
  }
};

export const createPosOrder = async (req, res) => {
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(idempotencyKey)) {
    return res.status(400).json({ message: 'A valid Idempotency-Key header is required.', code: 'POS_IDEMPOTENCY_REQUIRED' });
  }

  const paymentMethod = String(req.body?.payment_method || '').trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ message: 'POS supports cash or manual GCash payment.', code: 'POS_PAYMENT_METHOD_INVALID' });
  }
  const paymentReference = String(req.body?.payment_reference || '').trim();
  if (paymentMethod === 'gcash' && paymentReference.length < 4) {
    return res.status(400).json({ message: 'A GCash reference number is required.', code: 'POS_PAYMENT_REFERENCE_REQUIRED' });
  }

  let normalizedItems;
  try {
    normalizedItems = normalizeCartItems(req.body?.items);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message, code: error.code });
  }
  const canonicalRequest = {
    items: normalizedItems,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
    promotion_code: normalizeCode(req.body?.promotion_code),
    amount_tendered: paymentMethod === 'cash' ? money(req.body?.amount_tendered) : null,
  };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex');
  const client = await pool.connect();
  const stockUpdates = [];

  try {
    await client.query('BEGIN');
    const previous = await client.query(
      `SELECT * FROM idempotency_keys
       WHERE user_id = $1 AND scope = 'pos' AND key = $2
       FOR UPDATE`,
      [req.user.id, idempotencyKey],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].request_hash !== requestHash) throw fail(409, 'This idempotency key was used for a different sale.', 'POS_IDEMPOTENCY_MISMATCH');
      if (previous.rows[0].status === 'completed') {
        await client.query('COMMIT');
        return res.status(previous.rows[0].response_status || 201).json(previous.rows[0].response_body);
      }
      throw fail(409, 'This sale is already processing.', 'POS_ORDER_PROCESSING');
    }
    await client.query(
      `INSERT INTO idempotency_keys (user_id, scope, key, request_hash, expires_at)
       VALUES ($1, 'pos', $2, $3, NOW() + INTERVAL '24 hours')`,
      [req.user.id, idempotencyKey, requestHash],
    );

    const cart = await validateCart(client, normalizedItems, { lock: true, deduct: true });
    const promotion = await resolvePromotion(client, canonicalRequest.promotion_code, cart.subtotal, req.user);
    const discountAmount = promotion?.discount_amount || 0;
    const total = money(cart.subtotal - discountAmount);
    const taxAmount = money(total - (total / 1.12));
    const tendered = paymentMethod === 'cash' ? Number(req.body?.amount_tendered) : total;
    if (!Number.isFinite(tendered) || tendered < total) {
      throw fail(400, 'Amount received is below the server-calculated total.', 'POS_AMOUNT_INSUFFICIENT');
    }
    const changeDue = paymentMethod === 'cash' ? money(tendered - total) : 0;

    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, total_amount, subtotal_amount, shipping_fee, discount_amount, tax_amount,
         currency, status, shipping_address, source, payment_method, payment_provider,
         payment_status, payment_reference, amount_tendered, change_due, cashier_id,
         shipping_method, checkout_idempotency_key, promo_code_used, paid_at, pos_metadata
       ) VALUES (
         NULL, $1, $2, 0, $3, $4, 'PHP', 'paid', 'In-Store Pickup', 'pos',
         $5, $6, 'paid', $7, $8, $9, $10, 'pickup', $11, $12, NOW(), $13::jsonb
       ) RETURNING *`,
      [
        total, cart.subtotal, discountAmount, taxAmount, paymentMethod,
        paymentMethod === 'cash' ? 'cash' : 'manual', paymentReference || null,
        money(tendered), changeDue, req.user.id, idempotencyKey, promotion?.code || null,
        JSON.stringify({ terminal: 'web', item_count: cart.items.length }),
      ],
    );
    const order = orderResult.rows[0];
    const receiptNumber = `POS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(order.id).padStart(6, '0')}`;
    await client.query('UPDATE orders SET receipt_number = $1 WHERE id = $2', [receiptNumber, order.id]);

    for (const item of cart.items) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, variant_id, product_name, product_price, price, quantity,
           sku_snapshot, variant_name_snapshot, image_snapshot, unit_cost_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)`,
        [
          order.id, item.product_id, item.variant_id, item.product_name, item.unit_price,
          item.quantity, item.sku, item.variant_name, item.image, item.unit_cost_snapshot,
        ],
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, variant_id, order_id, quantity_delta, stock_before, stock_after,
           reason, reference_type, reference_id, created_by, metadata
         ) VALUES ($1,$2,$3::int,$4,$5,$6,'pos_sale','pos',$3::bigint,$7,$8::jsonb)`,
        [
          item.product_id, item.variant_id, order.id, -item.quantity, item.stock_before,
          item.stock_after, req.user.id, JSON.stringify({ receipt_number: receiptNumber }),
        ],
      );
      stockUpdates.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        stock_quantity: item.stock_after,
      });
    }

    await client.query(
      `INSERT INTO payments (
         order_id, user_id, provider, method, status, amount, currency, reference, metadata, paid_at
       ) VALUES ($1,$2,$3,$4,'paid',$5,'PHP',$6,$7::jsonb,NOW())`,
      [
        order.id, req.user.id, paymentMethod === 'cash' ? 'cash' : 'manual', paymentMethod,
        total, paymentReference || null, JSON.stringify({ source: 'pos', receipt_number: receiptNumber }),
      ],
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, source, changed_by, note)
       VALUES ($1, NULL, 'paid', 'pos', $2, 'In-store sale completed')`,
      [order.id, req.user.id],
    );
    if (promotion) {
      await client.query('UPDATE discounts SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1', [promotion.id]);
    }
    await logActivity(client, req, 'pos.sale', order.id, {
      receipt_number: receiptNumber,
      total_amount: total,
      payment_method: paymentMethod,
      item_count: cart.items.length,
    });

    const receipt = await buildReceipt(client, order.id);
    const response = { order: receipt, receipt };
    await client.query(
      `UPDATE idempotency_keys
       SET status = 'completed', response_status = 201, response_body = $4::jsonb, updated_at = NOW()
       WHERE user_id = $1 AND scope = 'pos' AND key = $2 AND request_hash = $3`,
      [req.user.id, idempotencyKey, requestHash, JSON.stringify(response)],
    );
    await client.query('COMMIT');

    stockUpdates.forEach(emitStockUpdate);
    emitNewOrder({ ...order, receipt_number: receiptNumber });
    return res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POS order failed:', error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'POS order could not be completed.',
      code: error.code || 'POS_ORDER_FAILED',
      ...(process.env.NODE_ENV !== 'production' && !error.status ? { diagnostic: error.message } : {}),
    });
  } finally {
    client.release();
  }
};

export const listPosOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || PAGE_SIZE));
    const search = String(req.query.search || '').trim();
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM orders
       WHERE source = 'pos' AND ($1 = '' OR receipt_number ILIKE $2 OR id::text = $1)`,
      [search, `%${search}%`],
    );
    const result = await pool.query(
      `SELECT o.id, o.receipt_number, o.status, o.payment_status, o.payment_method,
              o.total_amount, o.discount_amount, o.cashier_id, u.name AS cashier_name,
              o.created_at, o.voided_at, o.void_reason
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       WHERE o.source = 'pos' AND ($1 = '' OR o.receipt_number ILIKE $2 OR o.id::text = $1)
       ORDER BY o.created_at DESC
       LIMIT $3 OFFSET $4`,
      [search, `%${search}%`, limit, (page - 1) * limit],
    );
    return res.json({
      orders: result.rows.map((order) => ({ ...order, total_amount: money(order.total_amount), discount_amount: money(order.discount_amount) })),
      pagination: { page, limit, total: Number(countResult.rows[0]?.count || 0) },
    });
  } catch (error) {
    console.error('POS order list failed:', error);
    return res.status(500).json({ message: 'POS orders could not be loaded.', code: 'POS_ORDERS_FAILED' });
  }
};

export const getPosOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    return res.json({ order: await buildReceipt(client, Number(req.params.id)) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'POS order could not be loaded.', code: error.code || 'POS_ORDER_FAILED' });
  } finally {
    client.release();
  }
};

export const getPosReceipt = async (req, res) => {
  const client = await pool.connect();
  try {
    return res.json({ receipt: await buildReceipt(client, Number(req.params.id)) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Receipt could not be loaded.', code: error.code || 'POS_RECEIPT_FAILED' });
  } finally {
    client.release();
  }
};

export const voidPosOrder = async (req, res) => {
  const orderId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0 || reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ message: 'A valid POS order and void reason are required.', code: 'POS_VOID_INVALID' });
  }
  const client = await pool.connect();
  const stockUpdates = [];
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 AND source = 'pos' FOR UPDATE`, [orderId]);
    const order = orderResult.rows[0];
    if (!order) throw fail(404, 'POS order not found.', 'POS_ORDER_NOT_FOUND');
    if (order.status === 'cancelled' || order.voided_at) throw fail(409, 'This POS order has already been voided.', 'POS_ALREADY_VOIDED');
    if (order.status !== 'paid') throw fail(409, 'Only a paid POS order can be voided.', 'POS_VOID_STATUS_INVALID');

    const itemResult = await client.query(
      `SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = $1 ORDER BY id FOR UPDATE`,
      [orderId],
    );
    for (const item of itemResult.rows) {
      const table = item.variant_id ? 'product_variants' : 'products';
      const id = item.variant_id || item.product_id;
      const stockResult = await client.query(
        `UPDATE ${table}
         SET stock_quantity = stock_quantity + $1, updated_at = NOW()
         WHERE id = $2
         RETURNING stock_quantity - $1 AS before, stock_quantity AS after`,
        [item.quantity, id],
      );
      if (!stockResult.rowCount) throw fail(409, 'A product from this order no longer exists.', 'POS_VOID_PRODUCT_MISSING');
      const before = Number(stockResult.rows[0].before);
      const after = Number(stockResult.rows[0].after);
      await client.query(
        `INSERT INTO stock_movements (
           product_id, variant_id, order_id, quantity_delta, stock_before, stock_after,
           reason, reference_type, reference_id, created_by, metadata
         ) VALUES ($1,$2,$3::int,$4,$5,$6,'pos_void','pos',$3::bigint,$7,$8::jsonb)`,
        [item.product_id, item.variant_id, orderId, item.quantity, before, after, req.user.id, JSON.stringify({ reason })],
      );
      stockUpdates.push({ product_id: item.product_id, variant_id: item.variant_id, stock_quantity: after });
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled', payment_status = 'refunded',
       voided_at = NOW(), voided_by = $2, void_reason = $3, cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [orderId, req.user.id, reason],
    );
    await client.query(`UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE order_id = $1 AND status = 'paid'`, [orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, source, changed_by, note)
       VALUES ($1, 'paid', 'cancelled', 'pos', $2, $3)`,
      [orderId, req.user.id, reason],
    );
    if (order.promo_code_used) {
      await client.query(
        `UPDATE discounts SET used_count = GREATEST(0, used_count - 1), updated_at = NOW()
         WHERE UPPER(code) = UPPER($1)`,
        [order.promo_code_used],
      );
    }
    await logActivity(client, req, 'pos.void', orderId, { reason, receipt_number: order.receipt_number });
    const receipt = await buildReceipt(client, orderId);
    await client.query('COMMIT');
    stockUpdates.forEach(emitStockUpdate);
    emitOrderStatusUpdate({ id: orderId, user_id: null, status: 'cancelled', payment_status: 'refunded' }, null, { previous_status: 'paid', source: 'pos' });
    return res.json({ order: receipt });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'POS order could not be voided.', code: error.code || 'POS_VOID_FAILED' });
  } finally {
    client.release();
  }
};

export const getPosDailySummary = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'paid')::int AS transaction_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) AS gross_sales,
         COALESCE(SUM(discount_amount) FILTER (WHERE status = 'paid'), 0) AS discounts,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'cash'), 0) AS cash_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'gcash'), 0) AS gcash_sales,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS void_count
       FROM orders
       WHERE source = 'pos'
         AND created_at >= CURRENT_DATE
         AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
    );
    const summary = result.rows[0];
    return res.json({
      date: new Date().toISOString().slice(0, 10),
      transaction_count: Number(summary.transaction_count || 0),
      gross_sales: money(summary.gross_sales),
      discounts: money(summary.discounts),
      cash_sales: money(summary.cash_sales),
      gcash_sales: money(summary.gcash_sales),
      void_count: Number(summary.void_count || 0),
    });
  } catch (error) {
    console.error('POS daily summary failed:', error);
    return res.status(500).json({ message: 'POS summary could not be loaded.', code: 'POS_SUMMARY_FAILED' });
  }
};

export const __testing = {
  normalizeCartItems,
  round,
};
