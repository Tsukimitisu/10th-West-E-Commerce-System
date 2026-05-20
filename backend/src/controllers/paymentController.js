import pool from '../config/database.js';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';
import { createJntWaybillForOrder } from '../services/jntShipments.js';
import { createPaymongoGcashCheckout, verifyPaymongoWebhookSignature } from '../services/paymongo.js';
import { validatePhilippineAddress } from '../services/psgc.js';

const VAT_RATE = 0.12;
const JNT_SHIPPING_FEE = Number.parseFloat(process.env.JNT_STANDARD_SHIPPING_FEE || '150');
const FREE_JNT_SHIPPING_THRESHOLD = Number.parseFloat(process.env.JNT_FREE_SHIPPING_THRESHOLD || '2500');
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'expired', 'refunded']);

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.round(toFiniteNumber(value, 0) * 100) / 100;

const normalizeItems = (items = []) => (Array.isArray(items) ? items : [])
  .map((item) => ({
    product_id: Number(item.product_id ?? item.productId),
    quantity: Number(item.quantity),
  }))
  .filter((item) => Number.isInteger(item.product_id) && item.product_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);

const buildShippingAddressSnapshot = (snapshotInput = {}, shippingAddress) => ({
  recipient_name: normalizeText(snapshotInput.recipient_name),
  phone: normalizeText(snapshotInput.phone),
  street: normalizeText(snapshotInput.street),
  barangay: normalizeText(snapshotInput.barangay),
  city: normalizeText(snapshotInput.city),
  state: normalizeText(snapshotInput.state),
  postal_code: normalizeText(snapshotInput.postal_code),
  province_code: normalizeText(snapshotInput.province_code ?? snapshotInput.provinceCode),
  city_code: normalizeText(snapshotInput.city_code ?? snapshotInput.cityCode),
  barangay_code: normalizeText(snapshotInput.barangay_code ?? snapshotInput.barangayCode),
  country: normalizeText(snapshotInput.country) || 'Philippines',
  address_string: normalizeText(snapshotInput.address_string) || normalizeText(shippingAddress),
});

const computeShippingCost = (subtotal) => (
  subtotal >= FREE_JNT_SHIPPING_THRESHOLD ? 0 : roundMoney(JNT_SHIPPING_FEE)
);

export const ensurePaymentOrderColumns = async (db = pool) => {
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_shipping_method_enum')
         AND NOT EXISTS (
           SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'order_shipping_method_enum'
             AND e.enumlabel = 'jnt'
         ) THEN
        ALTER TYPE order_shipping_method_enum ADD VALUE 'jnt';
      END IF;
    END $$;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_checkout_url TEXT,
      ADD COLUMN IF NOT EXISTS payment_metadata JSONB,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_provider ON orders(payment_provider);
  `);

  await db.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'refunded'));
  `);
};

const paymentSchemaReady = ensurePaymentOrderColumns().catch((error) => {
  console.error('Failed to ensure payment order columns:', error);
});

const loadProductsForCheckout = async (client, normalizedItems) => {
  const uniqueProductIds = [...new Set(normalizedItems.map((item) => item.product_id))];
  const bundleComponentsResult = await client.query(
    `SELECT bc.bundle_product_id, bc.component_product_id, bc.quantity, bc.display_order
     FROM product_bundle_components bc
     WHERE bc.bundle_product_id = ANY($1::int[])`,
    [uniqueProductIds]
  );

  const componentIds = bundleComponentsResult.rows.map((row) => Number(row.component_product_id));
  const lockedProductIds = [...new Set([...uniqueProductIds, ...componentIds])];
  const productResult = await client.query(
    `SELECT id, name, price, stock_quantity, reserved_stock, product_type, status, shipping_weight_kg
     FROM products
     WHERE id = ANY($1::int[])
     FOR UPDATE`,
    [lockedProductIds]
  );

  const productMap = new Map(productResult.rows.map((product) => [Number(product.id), product]));
  const bundleComponentsByBundle = new Map();
  for (const component of bundleComponentsResult.rows) {
    const bundleId = Number(component.bundle_product_id);
    if (!bundleComponentsByBundle.has(bundleId)) bundleComponentsByBundle.set(bundleId, []);
    bundleComponentsByBundle.get(bundleId).push({
      component_product_id: Number(component.component_product_id),
      quantity: Number(component.quantity),
    });
  }

  return { productMap, bundleComponentsByBundle };
};

const buildCheckoutSnapshot = ({ normalizedItems, productMap, bundleComponentsByBundle }) => {
  const stockReservationMap = new Map();
  const orderItems = [];
  let subtotalAmount = 0;

  for (const item of normalizedItems) {
    const product = productMap.get(item.product_id);
    if (!product) {
      const error = new Error(`Product #${item.product_id} is no longer available.`);
      error.status = 400;
      throw error;
    }

    if (String(product.status || '').toLowerCase() !== 'active') {
      const error = new Error(`${product.name}: This product is not currently purchasable.`);
      error.status = 400;
      throw error;
    }

    const productPrice = toFiniteNumber(product.price, NaN);
    if (!Number.isFinite(productPrice) || productPrice < 0) {
      const error = new Error(`${product.name}: Invalid product price.`);
      error.status = 400;
      throw error;
    }

    subtotalAmount += roundMoney(productPrice * item.quantity);
    orderItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_price: roundMoney(productPrice),
      quantity: item.quantity,
    });

    if (String(product.product_type || 'single') === 'bundle') {
      const components = bundleComponentsByBundle.get(Number(product.id)) || [];
      if (components.length === 0) {
        const error = new Error(`${product.name}: Bundle has no configured components.`);
        error.status = 400;
        throw error;
      }

      for (const component of components) {
        const componentProduct = productMap.get(component.component_product_id);
        const requiredQuantity = component.quantity * item.quantity;
        const nextRequired = (stockReservationMap.get(component.component_product_id) || 0) + requiredQuantity;
        const availableStock = Number(componentProduct?.stock_quantity || 0) - Number(componentProduct?.reserved_stock || 0);

        if (!componentProduct || availableStock < nextRequired) {
          const error = new Error(`${product.name}: Maximum available bundle quantity is limited by ${componentProduct?.name || 'a component'}.`);
          error.status = 400;
          throw error;
        }

        stockReservationMap.set(component.component_product_id, nextRequired);
      }
    } else {
      const nextRequired = (stockReservationMap.get(Number(product.id)) || 0) + item.quantity;
      const availableStock = Number(product.stock_quantity || 0) - Number(product.reserved_stock || 0);
      if (availableStock < nextRequired) {
        const error = new Error(`${product.name}: Maximum available quantity is ${Math.max(0, availableStock)}.`);
        error.status = 400;
        throw error;
      }
      stockReservationMap.set(Number(product.id), nextRequired);
    }
  }

  return {
    orderItems,
    stockReservationMap,
    subtotalAmount: roundMoney(subtotalAmount),
  };
};

const reserveStock = async (client, stockReservationMap) => {
  for (const [productId, quantity] of stockReservationMap.entries()) {
    const result = await client.query(
      `UPDATE products
       SET reserved_stock = COALESCE(reserved_stock, 0) + $1
       WHERE id = $2
         AND (stock_quantity - COALESCE(reserved_stock, 0)) >= $1
       RETURNING id, name, stock_quantity, reserved_stock`,
      [quantity, productId]
    );

    if (result.rowCount === 0) {
      const error = new Error(`Unable to reserve stock for product #${productId}. Please try again.`);
      error.status = 400;
      throw error;
    }
  }
};

const createPendingGcashOrder = async ({ req, client, normalizedItems, orderItems, stockReservationMap, totals, addressSnapshot }) => {
  const paymentReference = `PM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const guestInfo = req.body?.guest_info || {};
  const userId = req.user?.id || null;

  const orderResult = await client.query(
    `INSERT INTO orders (
      user_id, guest_name, guest_email, total_amount,
      shipping_address, shipping_lat, shipping_lng, payment_intent_id, status,
      discount_amount, tax_amount, shipping_method, promo_code_used, payment_method, source,
      shipping_address_snapshot, courier, waybill_status,
      payment_provider, payment_status, payment_reference, payment_metadata, payment_expires_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, NULL, 'pending',
      $8, $9, 'jnt', $10, 'gcash', 'online',
      $11::jsonb, 'jnt', 'not_requested',
      'paymongo', 'pending', $12, $13::jsonb, NOW() + INTERVAL '30 minutes'
    )
    RETURNING *`,
    [
      userId,
      guestInfo.name || null,
      guestInfo.email || null,
      totals.total,
      addressSnapshot.address_string,
      req.body?.shipping_lat ?? null,
      req.body?.shipping_lng ?? null,
      totals.discount,
      totals.vat,
      req.body?.promo_code_used || null,
      JSON.stringify(addressSnapshot),
      paymentReference,
      JSON.stringify({
        reserved_stock: Array.from(stockReservationMap.entries()).map(([product_id, quantity]) => ({ product_id, quantity })),
        checkout_items: normalizedItems,
      }),
    ]
  );

  const order = orderResult.rows[0];
  for (const item of orderItems) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.id, item.product_id, item.product_name, item.product_price, item.quantity]
    );
  }

  return order;
};

const getReservedStockEntries = (order) => {
  const metadata = order?.payment_metadata && typeof order.payment_metadata === 'object'
    ? order.payment_metadata
    : {};
  return Array.isArray(metadata.reserved_stock) ? metadata.reserved_stock : [];
};

const markOrderPaid = async ({ orderId, event, checkoutId }) => {
  await paymentSchemaReady;
  const client = await pool.connect();
  const stockUpdates = [];
  let paidOrder = null;

  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return null;
    }

    if (order.payment_status === 'paid') {
      await client.query('COMMIT');
      return order;
    }

    for (const entry of getReservedStockEntries(order)) {
      const quantity = Math.max(0, Number(entry.quantity || 0));
      const productId = Number(entry.product_id);
      if (!productId || quantity <= 0) continue;

      const stockResult = await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity - $1,
             reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - $1)
         WHERE id = $2
           AND stock_quantity >= $1
         RETURNING id, name, stock_quantity, reserved_stock`,
        [quantity, productId]
      );

      if (stockResult.rowCount === 0) {
        const error = new Error(`Unable to finalize stock for product #${productId}.`);
        error.status = 409;
        throw error;
      }
      stockUpdates.push(stockResult.rows[0]);
    }

    if (order.user_id) {
      await client.query(
        `DELETE FROM cart_items
         WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)
           AND product_id IN (
             SELECT product_id
             FROM order_items
             WHERE order_id = $2
               AND product_id IS NOT NULL
           )`,
        [order.user_id, orderId]
      );
    }

    const updateResult = await client.query(
      `UPDATE orders
       SET status = 'paid',
           payment_status = 'paid',
           payment_provider = 'paymongo',
           payment_intent_id = COALESCE(payment_intent_id, $2),
           payment_metadata = COALESCE(payment_metadata, '{}'::jsonb) || $3::jsonb,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        orderId,
        checkoutId || null,
        JSON.stringify({ paymongo_paid_event: event, paid_at: new Date().toISOString() }),
      ]
    );
    paidOrder = updateResult.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  for (const stockUpdate of stockUpdates) {
    emitStockUpdate({
      product_id: stockUpdate.id,
      stock_quantity: Number(stockUpdate.stock_quantity),
      reserved_stock: Number(stockUpdate.reserved_stock || 0),
      name: stockUpdate.name,
    });
  }

  try {
    paidOrder = await createJntWaybillForOrder(pool, paidOrder.id, { generatedBy: null });
  } catch (waybillError) {
    console.error('Auto J&T waybill generation after PayMongo payment failed:', waybillError.message);
  }

  emitOrderStatusUpdate(paidOrder.id, 'paid');
  return paidOrder;
};

const releaseReservedStock = async ({ orderId, nextPaymentStatus, event }) => {
  await paymentSchemaReady;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = orderResult.rows[0];
    if (!order || order.payment_status === 'paid') {
      await client.query('COMMIT');
      return order || null;
    }

    for (const entry of getReservedStockEntries(order)) {
      const quantity = Math.max(0, Number(entry.quantity || 0));
      const productId = Number(entry.product_id);
      if (!productId || quantity <= 0) continue;
      await client.query(
        `UPDATE products
         SET reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - $1)
         WHERE id = $2`,
        [quantity, productId]
      );
    }

    const updateResult = await client.query(
      `UPDATE orders
       SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
           payment_status = $2,
           payment_metadata = COALESCE(payment_metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [orderId, nextPaymentStatus, JSON.stringify({ paymongo_terminal_event: event })]
    );

    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const createGcashCheckout = async (req, res) => {
  await paymentSchemaReady;
  const client = await pool.connect();

  try {
    const normalizedItems = normalizeItems(req.body?.items);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item.' });
    }

    const shippingAddress = normalizeText(req.body?.shipping_address);
    if (!shippingAddress) {
      return res.status(400).json({ message: 'Shipping address is required.' });
    }

    const addressSnapshot = buildShippingAddressSnapshot(req.body?.shipping_address_snapshot, shippingAddress);
    const postalCode = normalizeText(addressSnapshot.postal_code);
    if (!postalCode || !/^\d{4}$/.test(postalCode)) {
      return res.status(400).json({
        message: 'Please correct the highlighted address fields.',
        fieldErrors: { postal_code: 'ZIP code must contain exactly 4 digits.' },
      });
    }

    const addressValidation = await validatePhilippineAddress({
      state: addressSnapshot.state,
      city: addressSnapshot.city,
      barangay: addressSnapshot.barangay,
      province_code: addressSnapshot.province_code,
      city_code: addressSnapshot.city_code,
      barangay_code: addressSnapshot.barangay_code,
    });
    if (!addressValidation.valid) {
      return res.status(400).json({
        message: 'Please select a valid Philippine shipping address.',
        fieldErrors: addressValidation.fieldErrors,
      });
    }
    Object.assign(addressSnapshot, addressValidation.normalized);
    addressSnapshot.address_string = [
      addressSnapshot.recipient_name,
      addressSnapshot.street,
      addressSnapshot.barangay,
      addressSnapshot.city,
      `${addressSnapshot.state} ${addressSnapshot.postal_code || ''}`.trim(),
      'Philippines',
    ].filter(Boolean).join(', ');

    await client.query('BEGIN');
    const { productMap, bundleComponentsByBundle } = await loadProductsForCheckout(client, normalizedItems);
    const checkoutSnapshot = buildCheckoutSnapshot({ normalizedItems, productMap, bundleComponentsByBundle });
    await reserveStock(client, checkoutSnapshot.stockReservationMap);

    const discount = Math.min(
      roundMoney(Math.max(0, toFiniteNumber(req.body?.discount_amount, 0))),
      checkoutSnapshot.subtotalAmount
    );
    const shipping = computeShippingCost(checkoutSnapshot.subtotalAmount);
    const taxable = roundMoney(Math.max(0, checkoutSnapshot.subtotalAmount - discount + shipping));
    const vat = roundMoney(taxable * VAT_RATE);
    const total = roundMoney(taxable + vat);

    const order = await createPendingGcashOrder({
      req,
      client,
      normalizedItems,
      orderItems: checkoutSnapshot.orderItems,
      stockReservationMap: checkoutSnapshot.stockReservationMap,
      totals: { discount, vat, total },
      addressSnapshot,
    });

    await client.query('COMMIT');

    let checkout;
    try {
      checkout = await createPaymongoGcashCheckout({ order, items: checkoutSnapshot.orderItems });
    } catch (checkoutError) {
      await releaseReservedStock({
        orderId: order.id,
        nextPaymentStatus: 'failed',
        event: { type: 'local.paymongo_checkout_failed', message: checkoutError.message },
      }).catch((releaseError) => {
        console.error('Failed to release reserved stock after PayMongo checkout error:', releaseError);
      });
      throw checkoutError;
    }
    const updateResult = await pool.query(
      `UPDATE orders
       SET payment_intent_id = $2,
           payment_checkout_url = $3,
           payment_metadata = COALESCE(payment_metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [order.id, checkout.id, checkout.checkout_url, JSON.stringify({ paymongo_checkout: checkout.raw })]
    );

    emitNewOrder(updateResult.rows[0]);
    return res.status(201).json({
      order_id: order.id,
      checkout_url: checkout.checkout_url,
      payment_reference: order.payment_reference,
      payment_status: 'pending',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create GCash checkout error:', error);
    res.status(error.status || (error.code === 'PAYMONGO_NOT_CONFIGURED' ? 503 : 500)).json({
      message: error.message || 'Failed to create GCash checkout.',
    });
  } finally {
    client.release();
  }
};

const extractCheckoutSession = (eventPayload = {}) => {
  const event = eventPayload?.data?.attributes || {};
  const data = event.data || {};
  const checkout = data.attributes ? data : eventPayload?.data;
  return {
    eventType: event.type,
    checkoutId: checkout?.id || data?.id || null,
    attributes: checkout?.attributes || data?.attributes || {},
    event,
  };
};

export const handlePaymongoWebhook = async (req, res) => {
  await paymentSchemaReady;
  const validSignature = verifyPaymongoWebhookSignature({
    rawBody: req.rawBody,
    signatureHeader: req.headers['paymongo-signature'],
  });

  if (!validSignature) {
    return res.status(400).json({ message: 'Invalid PayMongo signature.' });
  }

  try {
    const payload = req.body || {};
    const { eventType, checkoutId, attributes, event } = extractCheckoutSession(payload);
    const metadata = attributes?.metadata || {};
    const orderId = Number(metadata.order_id);

    if (!orderId) {
      return res.json({ message: 'Webhook acknowledged without order metadata.' });
    }

    if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
      await markOrderPaid({ orderId, event, checkoutId });
    } else if (['payment.failed', 'checkout_session.payment.failed'].includes(eventType)) {
      await releaseReservedStock({ orderId, nextPaymentStatus: 'failed', event });
    } else if (['checkout_session.expired', 'source.expired', 'qrph.expired'].includes(eventType)) {
      await releaseReservedStock({ orderId, nextPaymentStatus: 'expired', event });
    }

    return res.json({ message: 'SUCCESS' });
  } catch (error) {
    console.error('PayMongo webhook error:', error);
    return res.status(500).json({ message: 'Failed to process PayMongo webhook.' });
  }
};

export const getPaymentOrderStatus = async (req, res) => {
  await paymentSchemaReady;
  try {
    const result = await pool.query(
      `SELECT id, user_id, status, payment_method, payment_provider, payment_status, payment_reference,
              payment_checkout_url, courier, waybill_number, waybill_status, tracking_number,
              total_amount, created_at, updated_at
       FROM orders
       WHERE id = $1`,
      [req.params.orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const order = result.rows[0];
    if (req.user?.role === 'customer' && Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    return res.json(order);
  } catch (error) {
    console.error('Get payment order status error:', error);
    return res.status(500).json({ message: 'Failed to load payment status.' });
  }
};

export const expirePendingPayment = async (orderId) => releaseReservedStock({
  orderId,
  nextPaymentStatus: 'expired',
  event: { type: 'local.expire_pending_payment' },
});

export const isPaymentStatus = (value) => PAYMENT_STATUSES.has(String(value || '').toLowerCase());
