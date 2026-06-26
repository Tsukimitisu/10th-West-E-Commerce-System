import crypto from 'crypto';
import pool from '../config/database.js';
import { createPaymongoGcashCheckout, verifyPaymongoWebhookSignature } from '../services/paymongo.js';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';

const PAYMENT_METHODS = new Set(['cod', 'gcash']);
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
const money = (value) => Number.parseFloat(value || 0);
const fail = (status, message, fieldErrors) => Object.assign(new Error(message), { status, fieldErrors });

const normalizeItems = (input) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw fail(400, 'Checkout requires 1 to 100 items.');
  const merged = new Map();
  for (const raw of input) {
    const productId = Number(raw?.product_id ?? raw?.productId);
    const variantValue = raw?.variant_id ?? raw?.variantId;
    const variantId = variantValue === undefined || variantValue === null || variantValue === '' ? null : Number(variantValue);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      throw fail(400, 'Each item requires a valid product_id and quantity from 1 to 100.');
    }
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) throw fail(400, 'variant_id is invalid.');
    const key = `${productId}:${variantId || 0}`;
    const nextQuantity = (merged.get(key)?.quantity || 0) + quantity;
    if (nextQuantity > 100) throw fail(400, 'Combined item quantity cannot exceed 100.');
    merged.set(key, { product_id: productId, variant_id: variantId, quantity: nextQuantity });
  }
  return [...merged.values()];
};

const hashRequest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const validateIdempotencyKey = (req) => {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key)) throw fail(400, 'A valid Idempotency-Key header is required.');
  return key;
};

const loadAddress = async (client, userId, addressId) => {
  const id = Number(addressId);
  if (!Number.isInteger(id) || id <= 0) throw fail(400, 'A saved address_id is required.');
  const result = await client.query(
    `SELECT * FROM addresses WHERE id = $1 AND user_id = $2 FOR SHARE`,
    [id, userId]
  );
  const address = result.rows[0];
  if (!address) throw fail(404, 'Saved address not found.');
  if (String(address.country || '').trim().toLowerCase() !== 'philippines') throw fail(400, 'Shipping is currently limited to the Philippines.');
  if (!/^\d{4}$/.test(String(address.postal_code || ''))) throw fail(400, 'The saved address has an invalid Philippine ZIP code.');
  if (!address.recipient_name || !address.phone || !address.street || !address.city || !address.state || !address.barangay) {
    throw fail(400, 'The saved address is incomplete.');
  }
  if (!/^(?:\+63|0)9\d{9}$/.test(String(address.phone).replace(/[\s()-]/g, ''))) throw fail(400, 'The saved address has an invalid Philippine mobile number.');
  if (address.lat !== null || address.lng !== null) {
    const lat = Number(address.lat);
    const lng = Number(address.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4.2 || lat > 21.3 || lng < 116 || lng > 127) {
      throw fail(400, 'The saved address coordinates are outside the Philippines.');
    }
  }
  return address;
};

const addressSnapshot = (address) => ({
  recipient_name: address.recipient_name,
  phone: address.phone,
  street: address.street,
  barangay: address.barangay,
  city: address.city,
  state: address.state,
  postal_code: address.postal_code,
  country: 'Philippines',
  province_code: address.province_code,
  city_code: address.city_code,
  barangay_code: address.barangay_code,
  lat: address.lat,
  lng: address.lng,
  address_string: address.address_string || formatAddress(address),
});

const formatAddress = (address) => [
  address.recipient_name, address.street, address.barangay, address.city,
  `${address.state} ${address.postal_code}`.trim(), 'Philippines',
].filter(Boolean).join(', ');

const loadAndReserveItems = async (client, items, expiresAt) => {
  const snapshots = [];
  let subtotal = 0;
  for (const item of items) {
    const productResult = await client.query(
      `SELECT p.*, EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id) AS has_variants
       FROM products p WHERE p.id = $1 AND COALESCE(p.is_deleted, false) = false FOR UPDATE`,
      [item.product_id]
    );
    const product = productResult.rows[0];
    if (!product || product.status !== 'active') throw fail(400, `Product #${item.product_id} is not available.`);
    if (product.product_type === 'bundle') throw fail(400, `${product.name} must be purchased through the bundle checkout flow.`);
    if (product.has_variants && !item.variant_id) throw fail(400, `Select a variant for ${product.name}.`);

    let variant = null;
    let unitPrice = money(product.sale_price && product.is_on_sale ? product.sale_price : product.price);
    let stockBefore;
    if (item.variant_id) {
      const variantResult = await client.query(
        `SELECT * FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE`,
        [item.variant_id, item.product_id]
      );
      variant = variantResult.rows[0];
      if (!variant) throw fail(400, `The selected variant for ${product.name} is invalid.`);
      unitPrice = variant.price !== null ? money(variant.price) : roundMoney(unitPrice + money(variant.price_adjustment));
      stockBefore = Number(variant.stock_quantity);
      const updated = await client.query(
        `UPDATE product_variants SET reserved_stock = reserved_stock + $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity - reserved_stock >= $1 RETURNING id`,
        [item.quantity, variant.id]
      );
      if (!updated.rowCount) throw fail(409, `Insufficient stock for ${product.name} (${variant.variant_value}).`);
    } else {
      stockBefore = Number(product.stock_quantity);
      const updated = await client.query(
        `UPDATE products SET reserved_stock = reserved_stock + $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity - reserved_stock >= $1 RETURNING id`,
        [item.quantity, product.id]
      );
      if (!updated.rowCount) throw fail(409, `Insufficient stock for ${product.name}.`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw fail(409, `${product.name} has an invalid price.`);
    subtotal = roundMoney(subtotal + unitPrice * item.quantity);
    snapshots.push({
      ...item,
      product_name: product.name,
      product_price: unitPrice,
      sku_snapshot: variant?.sku || product.sku || product.part_number,
      variant_name_snapshot: variant ? `${variant.variant_type}: ${variant.variant_value}` : null,
      image_snapshot: variant?.image_url || product.image || (Array.isArray(product.image_urls) ? product.image_urls[0] : null),
      stock_before: stockBefore,
      reservation_expires_at: expiresAt,
    });
  }
  return { snapshots, subtotal };
};

const calculateDiscount = async (client, userId, code, subtotal) => {
  if (!code) return { discount: 0, promotion: null };
  const normalized = String(code).trim().toUpperCase();
  const result = await client.query(
    `SELECT d.*, (SELECT COUNT(*) FROM discount_usages du WHERE du.discount_id = d.id AND du.user_id = $2) AS user_uses
     FROM discounts d WHERE UPPER(d.code) = $1 FOR UPDATE`,
    [normalized, userId]
  );
  const promotion = result.rows[0];
  if (!promotion || !promotion.is_active || promotion.deleted_at || (promotion.starts_at && new Date(promotion.starts_at) > new Date()) || (promotion.expires_at && new Date(promotion.expires_at) <= new Date())) {
    throw fail(400, 'Discount code is invalid or expired.');
  }
  if (subtotal < money(promotion.min_purchase)) throw fail(400, `This discount requires a minimum purchase of ₱${money(promotion.min_purchase).toFixed(2)}.`);
  if (promotion.max_uses !== null && Number(promotion.used_count) >= Number(promotion.max_uses)) throw fail(400, 'This discount has reached its usage limit.');
  if (Number(promotion.user_uses) >= Number(promotion.per_user_limit || 1)) throw fail(400, 'You have already used this discount.');
  let discount = promotion.type === 'percentage' ? subtotal * (money(promotion.value) / 100) : money(promotion.value);
  if (promotion.max_discount !== null) discount = Math.min(discount, money(promotion.max_discount));
  return { promotion, discount: roundMoney(Math.max(0, Math.min(subtotal, discount))) };
};

const calculateShipping = async (client, subtotal) => {
  const result = await client.query(
    `SELECT * FROM shipping_rates WHERE is_active = true AND method = 'standard' ORDER BY id LIMIT 1`
  );
  const rate = result.rows[0];
  if (!rate) return roundMoney(Number(process.env.DEFAULT_SHIPPING_FEE || 150));
  return rate.min_purchase_free !== null && subtotal >= money(rate.min_purchase_free) ? 0 : roundMoney(money(rate.base_fee));
};

const releaseOrderReservations = async (client, orderId, nextStatus, reason) => {
  const reservations = await client.query(
    `SELECT * FROM stock_reservations WHERE order_id = $1 AND status = 'active' FOR UPDATE`,
    [orderId]
  );
  for (const row of reservations.rows) {
    if (row.variant_id) {
      await client.query(`UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW() WHERE id = $2`, [row.quantity, row.variant_id]);
    } else {
      await client.query(`UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW() WHERE id = $2`, [row.quantity, row.product_id]);
    }
  }
  await client.query(`UPDATE stock_reservations SET status = 'released', released_at = NOW() WHERE order_id = $1 AND status = 'active'`, [orderId]);
  const current = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  const fromStatus = current.rows[0]?.status;
  if (fromStatus && fromStatus !== nextStatus) {
    await client.query(`UPDATE orders SET status = $2, payment_status = $2, updated_at = NOW() WHERE id = $1`, [orderId, nextStatus]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, source, note) VALUES ($1, $2, $3, 'payment', $4)`,
      [orderId, fromStatus, nextStatus, reason]
    );
  }
};

export const createCheckout = async (req, res) => {
  let client;
  let idempotencyKey;
  let requestHash;
  try {
    const items = normalizeItems(req.body?.items);
    const paymentMethod = String(req.body?.payment_method || '').trim().toLowerCase();
    if (!PAYMENT_METHODS.has(paymentMethod)) throw fail(400, 'payment_method must be cod or gcash.');
    idempotencyKey = validateIdempotencyKey(req);
    const requestIdentity = { items, address_id: Number(req.body?.address_id), discount_code: req.body?.discount_code || null, payment_method: paymentMethod };
    requestHash = hashRequest(requestIdentity);
    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM idempotency_keys WHERE user_id = $1 AND scope = 'checkout' AND key = $2 FOR UPDATE`,
      [req.user.id, idempotencyKey]
    );
    if (existing.rows[0]) {
      const saved = existing.rows[0];
      if (saved.request_hash !== requestHash) throw fail(409, 'This idempotency key was used for a different checkout.');
      if (saved.status === 'completed') {
        await client.query('COMMIT');
        return res.status(saved.response_status || 200).json(saved.response_body);
      }
      if (saved.status === 'failed') {
        await client.query('COMMIT');
        return res.status(saved.response_status || 502).json(saved.response_body || { message: 'Previous checkout attempt failed. Please retry with a new idempotency key.' });
      }
      throw fail(409, 'This checkout is already being processed.');
    }
    await client.query(
      `INSERT INTO idempotency_keys (user_id, scope, key, request_hash, expires_at) VALUES ($1, 'checkout', $2, $3, NOW() + INTERVAL '24 hours')`,
      [req.user.id, idempotencyKey, requestHash]
    );

    const address = await loadAddress(client, req.user.id, req.body?.address_id);
    const expiresAt = paymentMethod === 'gcash' ? new Date(Date.now() + 30 * 60 * 1000) : null;
    const { snapshots, subtotal } = await loadAndReserveItems(client, items, expiresAt);
    const { promotion, discount } = await calculateDiscount(client, req.user.id, req.body?.discount_code, subtotal);
    const shippingFee = await calculateShipping(client, subtotal);
    const taxRate = Math.max(0, Number(process.env.CHECKOUT_TAX_RATE || 0));
    const taxAmount = roundMoney(Math.max(0, subtotal - discount + shippingFee) * taxRate);
    const total = roundMoney(subtotal - discount + shippingFee + taxAmount);
    const snapshot = addressSnapshot(address);
    const orderStatus = paymentMethod === 'gcash' ? 'payment_pending' : 'pending';
    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, address_id, total_amount, subtotal_amount, shipping_fee, discount_amount, tax_amount, currency,
        status, payment_status, payment_method, payment_provider, source, shipping_method, shipping_address,
        shipping_address_snapshot, shipping_lat, shipping_lng, promo_code_used, checkout_idempotency_key, payment_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PHP',$8,'pending',$9,$10,'online','standard',$11,$12::jsonb,$13,$14,$15,$16,$17)
      RETURNING *`,
      [req.user.id, address.id, total, subtotal, shippingFee, discount, taxAmount, orderStatus, paymentMethod,
        paymentMethod === 'gcash' ? 'paymongo' : 'cod', formatAddress(address), JSON.stringify(snapshot), address.lat,
        address.lng, promotion?.code || null, idempotencyKey, expiresAt]
    );
    const order = orderResult.rows[0];
    for (const item of snapshots) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_price, price, quantity, sku_snapshot, variant_name_snapshot, image_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.id, item.product_id, item.variant_id, item.product_name, item.product_price, item.product_price, item.quantity,
          item.sku_snapshot, item.variant_name_snapshot, item.image_snapshot]
      );
      await client.query(
        `INSERT INTO stock_reservations (order_id, product_id, variant_id, quantity, expires_at) VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.product_id, item.variant_id, item.quantity, expiresAt]
      );
    }
    await client.query(
      `INSERT INTO order_status_history (order_id, to_status, source, changed_by, note) VALUES ($1,$2,'checkout',$3,'Order placed')`,
      [order.id, orderStatus, req.user.id]
    );
    const paymentResult = await client.query(
      `INSERT INTO payments (order_id, user_id, provider, method, status, amount, currency, expires_at)
       VALUES ($1,$2,$3,$4,'pending',$5,'PHP',$6) RETURNING *`,
      [order.id, req.user.id, paymentMethod === 'gcash' ? 'paymongo' : 'cod', paymentMethod, total, expiresAt]
    );
    if (promotion) {
      await client.query(`UPDATE discounts SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`, [promotion.id]);
      await client.query(
        `INSERT INTO discount_usages (discount_id, user_id, order_id, amount) VALUES ($1,$2,$3,$4)`,
        [promotion.id, req.user.id, order.id, discount]
      );
    }
    await client.query('COMMIT');

    let response = {
      order_id: order.id,
      payment_id: paymentResult.rows[0].id,
      payment_status: 'pending',
      status: orderStatus,
      currency: 'PHP',
      totals: { subtotal, shipping_fee: shippingFee, discount, tax: taxAmount, total },
    };
    if (paymentMethod === 'gcash') {
      let attemptId = null;
      try {
        const attempt = await pool.query(
          `INSERT INTO payment_attempts (payment_id, idempotency_key, status)
           VALUES ($1, $2, 'started')
           ON CONFLICT (idempotency_key) DO UPDATE SET status = 'started', error_message = NULL
           RETURNING id`,
          [paymentResult.rows[0].id, `${idempotencyKey}:paymongo-checkout`]
        );
        attemptId = attempt.rows[0]?.id || null;
        const checkout = await createPaymongoGcashCheckout({
          order: { ...order, payment_id: paymentResult.rows[0].id },
          items: snapshots,
        });
        await pool.query(
          `UPDATE payments SET external_checkout_id = $2, reference = $2, metadata = $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [paymentResult.rows[0].id, checkout.id, JSON.stringify({ checkout_url: checkout.checkout_url })]
        );
        await pool.query(
          `UPDATE orders SET payment_intent_id = $2, payment_reference = $2, payment_checkout_url = $3, updated_at = NOW() WHERE id = $1`,
          [order.id, checkout.id, checkout.checkout_url]
        );
        if (attemptId) {
          await pool.query(
            `UPDATE payment_attempts
             SET status = 'succeeded', http_status = 201, provider_response = $2::jsonb, completed_at = NOW()
             WHERE id = $1`,
            [attemptId, JSON.stringify({ checkout_id: checkout.id })]
          );
        }
        response = { ...response, checkout_url: checkout.checkout_url, payment_reference: checkout.id };
      } catch (providerError) {
        if (attemptId) {
          await pool.query(
            `UPDATE payment_attempts
             SET status = 'failed', error_message = $2, completed_at = NOW()
             WHERE id = $1`,
            [attemptId, String(providerError.message || 'PayMongo checkout failed').slice(0, 1000)]
          ).catch(() => {});
        }
        const releaseClient = await pool.connect();
        try {
          await releaseClient.query('BEGIN');
          await releaseOrderReservations(releaseClient, order.id, 'failed', 'Payment checkout creation failed');
          await releaseClient.query(`UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`, [paymentResult.rows[0].id]);
          await releaseClient.query('COMMIT');
        } catch (releaseError) {
          await releaseClient.query('ROLLBACK').catch(() => {});
          console.error('Checkout reservation release failed:', releaseError);
        } finally { releaseClient.release(); }
        await pool.query(
          `UPDATE idempotency_keys
           SET status = 'failed', response_status = $4, response_body = $5::jsonb, updated_at = NOW()
           WHERE user_id = $1 AND scope = 'checkout' AND key = $2 AND request_hash = $3`,
          [
            req.user.id,
            idempotencyKey,
            requestHash,
            providerError.code === 'PAYMONGO_NOT_CONFIGURED' ? 503 : 502,
            JSON.stringify({ message: providerError.message || 'Payment checkout creation failed.' }),
          ]
        ).catch(() => {});
        throw providerError;
      }
    }
    await pool.query(
      `UPDATE idempotency_keys SET status = 'completed', response_status = 201, response_body = $4::jsonb, updated_at = NOW()
       WHERE user_id = $1 AND scope = 'checkout' AND key = $2 AND request_hash = $3`,
      [req.user.id, idempotencyKey, requestHash, JSON.stringify(response)]
    );
    emitNewOrder({ ...order, ...response });
    return res.status(201).json(response);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Secure checkout error:', error);
    return res.status(error.status || (error.code === 'PAYMONGO_NOT_CONFIGURED' ? 503 : 500)).json({
      message: error.status ? error.message : 'Checkout could not be completed.',
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    });
  } finally {
    if (client) client.release();
  }
};

const extractPaymongoEvent = (payload) => {
  const eventId = payload?.data?.id;
  const event = payload?.data?.attributes || {};
  const resource = event.data || {};
  const attributes = resource.attributes || {};
  const nestedPayment = Array.isArray(attributes.payments) ? attributes.payments[0] : null;
  const paymentAttributes = nestedPayment?.attributes || attributes;
  return {
    eventId,
    eventType: event.type,
    resourceId: resource.id,
    attributes,
    paymentAttributes,
    metadata: attributes.metadata || paymentAttributes.metadata || {},
    checkoutId: attributes.checkout_session_id || paymentAttributes.checkout_session_id || (event.type?.startsWith('checkout_session.') ? resource.id : null),
    externalPaymentId: nestedPayment?.id || (event.type === 'payment.paid' ? resource.id : null),
    amount: paymentAttributes.amount,
    currency: paymentAttributes.currency,
  };
};

const finalizePaidOrder = async (client, payment, event) => {
  const reservations = await client.query(`SELECT * FROM stock_reservations WHERE order_id = $1 AND status = 'active' FOR UPDATE`, [payment.order_id]);
  if (!reservations.rowCount) throw fail(409, 'Payment has no active stock reservation.');
  for (const row of reservations.rows) {
    let stock;
    if (row.variant_id) {
      stock = await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity - $1, reserved_stock = reserved_stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity >= $1 AND reserved_stock >= $1 RETURNING stock_quantity + $1 AS stock_before, stock_quantity AS stock_after`,
        [row.quantity, row.variant_id]
      );
    } else {
      stock = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1, reserved_stock = reserved_stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity >= $1 AND reserved_stock >= $1 RETURNING stock_quantity + $1 AS stock_before, stock_quantity AS stock_after`,
        [row.quantity, row.product_id]
      );
    }
    if (!stock.rowCount) throw fail(409, 'Reserved stock could not be finalized.');
    await client.query(
      `INSERT INTO stock_movements (product_id, variant_id, order_id, quantity_delta, stock_before, stock_after, reason, reference_type, reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,'sale','payment',$7)`,
      [row.product_id, row.variant_id, payment.order_id, -Number(row.quantity), stock.rows[0].stock_before, stock.rows[0].stock_after, payment.id]
    );
  }
  await client.query(`UPDATE stock_reservations SET status = 'committed', committed_at = NOW() WHERE order_id = $1 AND status = 'active'`, [payment.order_id]);
  const order = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [payment.order_id]);
  await client.query(
    `UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = NOW(), payment_reference = COALESCE($2, payment_reference), updated_at = NOW() WHERE id = $1`,
    [payment.order_id, event.externalPaymentId]
  );
  await client.query(
    `UPDATE payments SET status = 'paid', external_payment_id = COALESCE($2, external_payment_id), paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [payment.id, event.externalPaymentId]
  );
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, source, note, metadata) VALUES ($1,$2,'paid','payment','PayMongo payment verified',$3::jsonb)`,
    [payment.order_id, order.rows[0].status, JSON.stringify({ event_id: event.eventId })]
  );
};

export const handlePaymongoWebhook = async (req, res) => {
  if (!verifyPaymongoWebhookSignature({ rawBody: req.rawBody, signatureHeader: req.get('Paymongo-Signature') })) {
    return res.status(400).json({ message: 'Invalid PayMongo signature.' });
  }
  const event = extractPaymongoEvent(req.body || {});
  if (!event.eventId || !event.eventType) return res.status(400).json({ message: 'Malformed PayMongo event.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO payment_events (provider, external_event_id, event_type, payload) VALUES ('paymongo',$1,$2,$3::jsonb)
       ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`,
      [event.eventId, event.eventType, JSON.stringify(req.body)]
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return res.json({ message: 'Event already processed.' });
    }
    const paymentId = Number(event.metadata.payment_id);
    const paymentResult = paymentId
      ? await client.query(`SELECT p.*, o.user_id AS order_user_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 FOR UPDATE OF p, o`, [paymentId])
      : await client.query(`SELECT p.*, o.user_id AS order_user_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.provider = 'paymongo' AND p.external_checkout_id = $1 FOR UPDATE OF p, o`, [event.checkoutId]);
    const payment = paymentResult.rows[0];
    if (!payment || payment.provider !== 'paymongo') throw fail(400, 'Webhook payment does not match a local payment.');
    if (event.checkoutId && payment.external_checkout_id !== event.checkoutId) throw fail(400, 'Checkout session mismatch.');
    const receivedAmount = Number(event.amount) / 100;
    const receivedCurrency = String(event.currency || '').toUpperCase();
    const amountMatches = Number.isInteger(Number(event.amount)) && roundMoney(receivedAmount) === roundMoney(money(payment.amount));
    const currencyMatches = receivedCurrency === payment.currency;
    await client.query(
      `INSERT INTO payment_reconciliations (payment_id, result, expected_amount, received_amount, expected_currency, received_currency, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [payment.id, amountMatches && currencyMatches ? 'matched' : 'rejected', payment.amount,
        Number.isFinite(receivedAmount) ? receivedAmount : null, payment.currency, receivedCurrency || null,
        JSON.stringify({ event_id: event.eventId, checkout_id: event.checkoutId })]
    );
    if (!amountMatches || !currencyMatches) throw fail(400, 'Payment amount or currency mismatch.');

    if (['payment.paid', 'checkout_session.payment.paid'].includes(event.eventType)) {
      if (payment.status !== 'paid') await finalizePaidOrder(client, payment, event);
    } else if (['payment.failed', 'checkout_session.payment.failed', 'checkout_session.expired'].includes(event.eventType)) {
      const terminalStatus = event.eventType.endsWith('expired') ? 'expired' : 'failed';
      if (payment.status !== 'paid') {
        await releaseOrderReservations(client, payment.order_id, 'failed', `PayMongo ${terminalStatus}`);
        await client.query(`UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1`, [payment.id, terminalStatus]);
      }
    }
    await client.query(
      `UPDATE payment_events SET payment_id = $2, processing_status = 'processed', processed_at = NOW() WHERE id = $1`,
      [inserted.rows[0].id, payment.id]
    );
    await client.query('COMMIT');
    const emittedStatus = ['payment.paid', 'checkout_session.payment.paid'].includes(event.eventType)
      ? 'paid'
      : ['payment.failed', 'checkout_session.payment.failed', 'checkout_session.expired'].includes(event.eventType)
        ? 'failed'
        : 'payment_pending';
    emitOrderStatusUpdate(payment.order_id, emittedStatus, {
      payment_status: emittedStatus === 'paid' ? 'paid' : emittedStatus,
      timeline_event: { source: 'payment', event_id: event.eventId, event_type: event.eventType },
    });
    return res.json({ message: 'SUCCESS' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PayMongo webhook processing failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Webhook processing failed.' });
  } finally { client.release(); }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Invalid order ID.' });
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    const result = await pool.query(
      `SELECT o.id AS order_id, o.user_id, o.status AS order_status, p.status AS payment_status,
              p.provider, p.method, p.amount, p.currency, p.reference, p.expires_at, p.paid_at, p.updated_at
       FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1 AND ($2::boolean OR o.user_id = $3) ORDER BY p.created_at DESC LIMIT 1`,
      [orderId, staff, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Payment not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Get payment status failed:', error);
    return res.status(500).json({ message: 'Payment status could not be loaded.' });
  }
};

export const retryPayment = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Invalid order ID.' });
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key)) return res.status(400).json({ message: 'A valid Idempotency-Key header is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, req.user.id]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (order.payment_method !== 'gcash' || order.payment_provider !== 'paymongo') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only PayMongo GCash payments can be retried.' });
    }
    if (order.payment_status === 'paid' || order.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order is already paid.' });
    }
    const reservationResult = await client.query(
      `SELECT 1 FROM stock_reservations WHERE order_id = $1 AND status = 'active' LIMIT 1`,
      [orderId]
    );
    if (!reservationResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'The stock reservation has expired. Start a new checkout.' });
    }
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 AND provider = 'paymongo' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment record not found.' });
    }
    const existingAttempt = await client.query(
      `SELECT * FROM payment_attempts WHERE idempotency_key = $1 FOR UPDATE`,
      [key]
    );
    if (existingAttempt.rows[0]?.status === 'succeeded' && payment.metadata?.checkout_url) {
      await client.query('COMMIT');
      return res.json({ order_id: orderId, checkout_url: payment.metadata.checkout_url, payment_reference: payment.external_checkout_id || payment.reference });
    }
    const attempt = await client.query(
      `INSERT INTO payment_attempts (payment_id, idempotency_key, status)
       VALUES ($1, $2, 'started')
       ON CONFLICT (idempotency_key) DO UPDATE SET status = 'started', error_message = NULL
       RETURNING id`,
      [payment.id, key]
    );
    await client.query('COMMIT');

    const items = (await pool.query(
      `SELECT product_id, product_name, product_price, quantity FROM order_items WHERE order_id = $1 ORDER BY id`,
      [orderId]
    )).rows;
    const checkout = await createPaymongoGcashCheckout({
      order: { ...order, payment_id: payment.id },
      items,
    });
    await pool.query(
      `UPDATE payments
       SET status = 'pending', external_checkout_id = $2, reference = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [payment.id, checkout.id, JSON.stringify({ checkout_url: checkout.checkout_url, retry: true })]
    );
    await pool.query(
      `UPDATE orders
       SET status = 'payment_pending', payment_status = 'pending', payment_reference = $2,
           payment_checkout_url = $3, updated_at = NOW()
       WHERE id = $1`,
      [orderId, checkout.id, checkout.checkout_url]
    );
    await pool.query(
      `UPDATE payment_attempts
       SET status = 'succeeded', http_status = 201, provider_response = $2::jsonb, completed_at = NOW()
       WHERE id = $1`,
      [attempt.rows[0].id, JSON.stringify({ checkout_id: checkout.id })]
    );
    emitOrderStatusUpdate(orderId, 'payment_pending', { payment_status: 'pending' });
    return res.json({ order_id: orderId, checkout_url: checkout.checkout_url, payment_reference: checkout.id, payment_status: 'pending' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await pool.query(
      `UPDATE payment_attempts SET status = 'failed', error_message = $2, completed_at = NOW() WHERE idempotency_key = $1`,
      [key, String(error.message || 'Payment retry failed').slice(0, 1000)]
    ).catch(() => {});
    console.error('Retry payment failed:', error);
    return res.status(error.status || (error.code === 'PAYMONGO_NOT_CONFIGURED' ? 503 : 500)).json({ message: error.message || 'Payment retry failed.' });
  } finally { client.release(); }
};

export const expirePaymentSession = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Invalid order ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    const result = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND ($2::boolean OR user_id = $3) FOR UPDATE`,
      [orderId, staff, req.user.id]
    );
    const order = result.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (order.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Paid payment sessions cannot be expired.' });
    }
    await releaseOrderReservations(client, orderId, 'failed', 'Payment session expired');
    await client.query(`UPDATE payments SET status = 'expired', updated_at = NOW() WHERE order_id = $1 AND status <> 'paid'`, [orderId]);
    await client.query('COMMIT');
    emitOrderStatusUpdate(orderId, 'failed', { payment_status: 'expired' });
    return res.json({ message: 'Payment session expired.', order_id: orderId, status: 'failed', payment_status: 'expired' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Expire payment session failed:', error);
    return res.status(500).json({ message: 'Payment session could not be expired.' });
  } finally { client.release(); }
};

export const getPaymentReconciliation = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    const paymentResult = await pool.query(
      `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.order_id = $1 AND ($2::boolean OR o.user_id = $3)
       ORDER BY p.created_at DESC LIMIT 1`,
      [orderId, staff, req.user.id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) return res.status(404).json({ message: 'Payment not found.' });
    const [events, reconciliations, attempts] = await Promise.all([
      pool.query(
        `SELECT external_event_id, event_type, processing_status, processed_at, created_at
         FROM payment_events WHERE payment_id = $1 ORDER BY created_at DESC`,
        [payment.id]
      ),
      pool.query(
        `SELECT result, expected_amount, received_amount, expected_currency, received_currency, details, created_at
         FROM payment_reconciliations WHERE payment_id = $1 ORDER BY created_at DESC`,
        [payment.id]
      ),
      pool.query(
        `SELECT status, http_status, error_message, created_at, completed_at
         FROM payment_attempts WHERE payment_id = $1 ORDER BY created_at DESC`,
        [payment.id]
      ),
    ]);
    return res.json({ payment, events: events.rows, reconciliations: reconciliations.rows, attempts: attempts.rows });
  } catch (error) {
    console.error('Get payment reconciliation failed:', error);
    return res.status(500).json({ message: 'Payment reconciliation could not be loaded.' });
  }
};

const checkoutOrderWhere = (checkoutId, staff) => {
  const numericId = Number(checkoutId);
  if (Number.isInteger(numericId) && numericId > 0) {
    return {
      sql: `o.id = $1 AND ($2::boolean OR o.user_id = $3)`,
      params: [numericId, staff],
    };
  }
  const key = String(checkoutId || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key)) throw fail(400, 'Invalid checkout ID.');
  return {
    sql: `o.checkout_idempotency_key = $1 AND ($2::boolean OR o.user_id = $3)`,
    params: [key, staff],
  };
};

const loadCheckoutOrder = async (client, { checkoutId, user, forUpdate = false }) => {
  const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(user.role);
  const where = checkoutOrderWhere(checkoutId, staff);
  const lock = forUpdate ? ' FOR UPDATE OF o' : '';
  const result = await client.query(
    `SELECT o.*
     FROM orders o
     WHERE ${where.sql}${lock}`,
    [...where.params, user.id]
  );
  return result.rows[0] || null;
};

const buildCheckoutResponse = async (client, order) => {
  const [itemsResult, paymentResult] = await Promise.all([
    client.query(
      `SELECT id, product_id, variant_id, product_name, product_price, quantity,
              sku_snapshot, variant_name_snapshot, image_snapshot
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [order.id]
    ),
    client.query(
      `SELECT id, provider, method, status, amount, currency, external_checkout_id,
              external_payment_id, reference, metadata, expires_at, paid_at, updated_at
       FROM payments
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [order.id]
    ),
  ]);
  const payment = paymentResult.rows[0] || null;
  const metadata = payment?.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  return {
    checkout_id: order.checkout_idempotency_key || String(order.id),
    order_id: order.id,
    status: order.status,
    payment_status: payment?.status || order.payment_status,
    payment_method: order.payment_method,
    payment_provider: order.payment_provider,
    checkout_url: metadata.checkout_url || order.payment_checkout_url || null,
    payment_reference: payment?.reference || order.payment_reference || null,
    expires_at: payment?.expires_at || order.payment_expires_at || null,
    currency: order.currency || 'PHP',
    totals: {
      subtotal: money(order.subtotal_amount),
      shipping_fee: money(order.shipping_fee),
      discount: money(order.discount_amount),
      tax: money(order.tax_amount),
      total: money(order.total_amount),
    },
    items: itemsResult.rows.map((item) => ({
      ...item,
      product_price: money(item.product_price),
      quantity: Number(item.quantity),
    })),
    payment,
  };
};

export const getCheckout = async (req, res) => {
  const client = await pool.connect();
  try {
    const order = await loadCheckoutOrder(client, {
      checkoutId: req.params.checkoutId,
      user: req.user,
    });
    if (!order) return res.status(404).json({ message: 'Checkout not found.' });
    return res.json(await buildCheckoutResponse(client, order));
  } catch (error) {
    console.error('Get checkout failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Checkout could not be loaded.' });
  } finally { client.release(); }
};

export const confirmCheckout = async (req, res) => {
  const checkoutId = req.body?.checkout_id || req.body?.checkoutId || req.body?.order_id || req.body?.orderId;
  if (!checkoutId) return res.status(400).json({ message: 'checkout_id or order_id is required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await loadCheckoutOrder(client, { checkoutId, user: req.user, forUpdate: true });
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Checkout not found.' });
    }
    const payment = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [order.id]
    );
    const currentPayment = payment.rows[0] || null;
    if (currentPayment?.expires_at && new Date(currentPayment.expires_at) <= new Date() && currentPayment.status !== 'paid') {
      await releaseOrderReservations(client, order.id, 'failed', 'Payment reservation expired during checkout confirmation');
      await client.query(`UPDATE payments SET status = 'expired', updated_at = NOW() WHERE id = $1`, [currentPayment.id]);
      await client.query('COMMIT');
      emitOrderStatusUpdate(order.id, 'failed');
      return res.status(409).json({ message: 'Checkout payment session has expired.', status: 'failed', payment_status: 'expired' });
    }
    await client.query('COMMIT');
    const statusCode = currentPayment?.status === 'paid' || order.payment_method === 'cod' ? 200 : 202;
    return res.status(statusCode).json(await buildCheckoutResponse(pool, order));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Confirm checkout failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Checkout could not be confirmed.' });
  } finally { client.release(); }
};

export const cancelCheckout = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await loadCheckoutOrder(client, {
      checkoutId: req.params.checkoutId,
      user: req.user,
      forUpdate: true,
    });
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Checkout not found.' });
    }
    if (order.payment_status === 'paid' || order.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Paid orders must be cancelled through the order cancellation flow.' });
    }
    if (!['pending', 'payment_pending', 'failed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This checkout can no longer be cancelled.' });
    }
    await releaseOrderReservations(client, order.id, 'cancelled', 'Checkout cancelled by user');
    await client.query(`UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE order_id = $1 AND status <> 'paid'`, [order.id]);
    await client.query('COMMIT');
    emitOrderStatusUpdate(order.id, 'cancelled');
    return res.json({ message: 'Checkout cancelled.', order_id: order.id, status: 'cancelled', payment_status: 'cancelled' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cancel checkout failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Checkout could not be cancelled.' });
  } finally { client.release(); }
};

export const cleanupExpiredReservations = async (_req, res) => {
  try {
    const released = await releaseExpiredReservations();
    return res.json({ message: 'Expired checkout reservations cleaned up.', released });
  } catch (error) {
    console.error('Manual reservation cleanup failed:', error);
    return res.status(500).json({ message: 'Expired checkout reservations could not be cleaned up.' });
  }
};

export const validateDiscount = async (req, res) => {
  const client = await pool.connect();
  try {
    const items = normalizeItems(req.body?.items);
    await client.query('BEGIN');
    let subtotal = 0;
    for (const item of items) {
      const result = await client.query(
        `SELECT p.price, p.sale_price, p.is_on_sale, pv.id AS matched_variant_id, pv.price AS variant_price, pv.price_adjustment
         FROM products p LEFT JOIN product_variants pv ON pv.id = $2 AND pv.product_id = p.id
         WHERE p.id = $1 AND p.status = 'active' AND COALESCE(p.is_deleted, false) = false`,
        [item.product_id, item.variant_id]
      );
      if (!result.rowCount || (item.variant_id && !result.rows[0].matched_variant_id)) throw fail(400, 'One or more checkout items are unavailable.');
      const row = result.rows[0];
      const base = money(row.is_on_sale && row.sale_price ? row.sale_price : row.price);
      const price = row.variant_price !== null && row.variant_price !== undefined ? money(row.variant_price) : base + money(row.price_adjustment);
      subtotal = roundMoney(subtotal + price * item.quantity);
    }
    const result = await calculateDiscount(client, req.user.id, req.body?.discount_code, subtotal);
    await client.query('ROLLBACK');
    const promotion = result.promotion ? {
      id: result.promotion.id,
      code: result.promotion.code,
      type: result.promotion.type,
      value: Number(result.promotion.value),
      max_discount: result.promotion.max_discount === null ? null : Number(result.promotion.max_discount),
    } : null;
    return res.json({ valid: true, code: promotion?.code, subtotal, discount: promotion, discountAmount: result.discount, total_after_discount: roundMoney(subtotal - result.discount) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.status || 500).json({ valid: false, message: error.status ? error.message : 'Discount could not be validated.' });
  } finally { client.release(); }
};

export const releaseExpiredReservations = async () => {
  const result = await pool.query(`SELECT DISTINCT order_id FROM stock_reservations WHERE status = 'active' AND expires_at <= NOW() LIMIT 100`);
  for (const row of result.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await releaseOrderReservations(client, row.order_id, 'failed', 'Payment reservation expired');
      await client.query(`UPDATE payments SET status = 'expired', updated_at = NOW() WHERE order_id = $1 AND status IN ('pending','processing')`, [row.order_id]);
      await client.query('COMMIT');
      emitOrderStatusUpdate(row.order_id, 'failed', { payment_status: 'expired' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Expired reservation cleanup failed:', { orderId: row.order_id, error: error.message });
    } finally { client.release(); }
  }
  return result.rowCount;
};

let reservationCleanupTimer = null;

export const startExpiredReservationCleanup = ({ intervalMs = Number(process.env.RESERVATION_CLEANUP_INTERVAL_MS || 60000) } = {}) => {
  if (reservationCleanupTimer || String(process.env.RESERVATION_CLEANUP_DISABLED || '').toLowerCase() === 'true') {
    return reservationCleanupTimer;
  }

  const safeInterval = Math.max(15000, Number(intervalMs) || 60000);
  reservationCleanupTimer = setInterval(() => {
    releaseExpiredReservations().catch((error) => {
      console.error('Scheduled reservation cleanup failed:', error);
    });
  }, safeInterval);
  reservationCleanupTimer.unref?.();
  return reservationCleanupTimer;
};
