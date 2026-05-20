import pool from '../config/database.js';
import Stripe from 'stripe';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';
import { ORDER_STATUSES, STAFF_ROLE_SET } from '../constants/schemaEnums.js';
import { buildReturnEligibility, getReturnSettings } from '../utils/returnPolicy.js';
import { buildOrderStatusMessage, createNotification as createUserNotification, ensureNotificationColumns } from '../utils/notifications.js';
import { validatePhilippineAddress } from '../services/psgc.js';
import { createJntWaybillForOrder, ensureJntOrderColumns, getJntWaybill, normalizeWaybillStatus } from '../services/jntShipments.js';
import { ensurePaymentOrderColumns } from './paymentController.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const STAFF_ROLES = STAFF_ROLE_SET;
const VALID_ORDER_STATUSES = ORDER_STATUSES;
const ORDER_STATUS_SQL_LIST = ORDER_STATUSES.map((status) => `'${status}'`).join(', ');
const VAT_RATE = 0.12;
const FREE_STANDARD_SHIPPING_THRESHOLD = 2500;
const STANDARD_SHIPPING_FEE = 150;
const EXPRESS_SHIPPING_FEE = 300;
const STAFF_STATUS_TRANSITIONS = {
  pending: new Set(['paid', 'preparing', 'cancelled']),
  paid: new Set(['preparing', 'cancelled']),
  preparing: new Set(['shipped', 'cancelled']),
  shipped: new Set([]),
  delivered: new Set([]),
  completed: new Set([]),
  cancelled: new Set([]),
};
const DEFAULT_ORDER_LIMIT = 20;
const MAX_ORDER_LIMIT = 100;

const ORDER_NOTIFICATION_DETAIL_QUERY = `
  SELECT o.id, o.user_id, o.status, o.order_number, o.tracking_number,
         oi.product_id, COALESCE(oi.product_name, p.name) as product_name,
         p.image as product_image
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE o.id = $1
  ORDER BY oi.id ASC
  LIMIT 1
`;

const ensureOrderWorkflowColumns = async () => {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rider_confirmed_delivery_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rider_confirmed_by INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS customer_confirmed_receipt_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS courier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS waybill_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS waybill_status VARCHAR(30) NOT NULL DEFAULT 'not_requested',
      ADD COLUMN IF NOT EXISTS waybill_generated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS waybill_label_payload JSONB,
      ADD COLUMN IF NOT EXISTS courier_metadata JSONB;
  `).catch((error) => {
    console.error('Failed to ensure order support columns:', error);
  });
  await ensureJntOrderColumns(pool).catch((error) => {
    console.error('Failed to ensure J&T order columns:', error);
  });
  await ensurePaymentOrderColumns(pool).catch((error) => {
    console.error('Failed to ensure payment order columns:', error);
  });

  await pool.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN (${ORDER_STATUS_SQL_LIST}));
  `).catch((error) => {
    console.error('Failed to ensure order status constraint:', error);
  });

  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_unique
     ON orders(payment_intent_id)
     WHERE payment_intent_id IS NOT NULL`
  ).catch((error) => {
    console.error('Failed to ensure payment_intent_id uniqueness index:', error);
  });
};
ensureOrderWorkflowColumns();
ensureNotificationColumns();

const canStaffTransitionStatus = (currentStatus, nextStatus) => {
  const allowed = STAFF_STATUS_TRANSITIONS[currentStatus] || new Set();
  return allowed.has(nextStatus);
};

const parsePagination = (query = {}) => {
  const parsedPage = Number.parseInt(String(query.page || ''), 10);
  const parsedLimit = Number.parseInt(String(query.limit || ''), 10);

  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_ORDER_LIMIT)
    : DEFAULT_ORDER_LIMIT;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    paginated: query.page !== undefined || query.limit !== undefined,
  };
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => {
  const parsed = toFiniteNumber(value, 0);
  return Math.round(parsed * 100) / 100;
};

const resolveShippingMethod = (value) => {
  const normalized = String(value || 'standard').trim().toLowerCase();
  if (normalized === 'express' || normalized === 'pickup' || normalized === 'standard') {
    return normalized;
  }
  return 'standard';
};

const computeShippingCost = (subtotalAmount, shippingMethod) => {
  if (shippingMethod === 'pickup') return 0;
  if (shippingMethod === 'express') return EXPRESS_SHIPPING_FEE;
  return subtotalAmount >= FREE_STANDARD_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
};

const buildShippingAddressSnapshot = (snapshotInput = {}, shippingAddress) => {
  const snapshot = {
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
  };

  return snapshot;
};

const parseShippingAddressSnapshot = (order) => {
  const snapshot = order.shipping_address_snapshot && typeof order.shipping_address_snapshot === 'object'
    ? order.shipping_address_snapshot
    : null;

  return buildShippingAddressSnapshot(snapshot || {}, order.shipping_address);
};

const mapOrderRecord = (order) => ({
  ...order,
  total_amount: roundMoney(order.total_amount),
  discount_amount: roundMoney(order.discount_amount || 0),
  tax_amount: roundMoney(order.tax_amount || 0),
  shipping_method: resolveShippingMethod(order.shipping_method),
  shipping_address_snapshot: parseShippingAddressSnapshot(order),
  courier: normalizeText(order.courier),
  waybill_number: normalizeText(order.waybill_number),
  waybill_status: normalizeWaybillStatus(order.waybill_status),
  waybill_generated_at: order.waybill_generated_at || null,
  waybill_label_payload: order.waybill_label_payload || null,
  courier_metadata: order.courier_metadata || null,
  payment_provider: normalizeText(order.payment_provider),
  payment_status: normalizeText(order.payment_status) || (['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(String(order.status || '').toLowerCase()) ? 'paid' : 'pending'),
  payment_reference: normalizeText(order.payment_reference),
  payment_checkout_url: normalizeText(order.payment_checkout_url),
  payment_metadata: order.payment_metadata || null,
  paid_at: order.paid_at || null,
});

const buildOrderReturnInfo = async (db, order, userId, isStaff) => {
  const [settings, latestReturnResult] = await Promise.all([
    getReturnSettings(db),
    db.query(
      `SELECT id, status, created_at, updated_at
       FROM returns
       WHERE order_id = $1
         ${isStaff ? '' : 'AND user_id = $2'}
       ORDER BY created_at DESC
       LIMIT 1`,
      isStaff ? [order.id] : [order.id, userId]
    ),
  ]);

  const latestReturn = latestReturnResult.rows[0] || null;
  const eligibility = buildReturnEligibility({
    order,
    latestReturn,
    returnWindowDays: settings.returnWindowDays,
  });

  return {
    return_eligible: eligibility.eligible,
    return_eligibility_message: eligibility.message,
    return_window_days: eligibility.returnWindowDays,
    return_deadline_at: eligibility.deadlineAt ? eligibility.deadlineAt.toISOString() : null,
    delivered_at: eligibility.deliveredAt ? eligibility.deliveredAt.toISOString() : (order.delivered_at || null),
    return_request: latestReturn ? {
      id: latestReturn.id,
      status: latestReturn.status,
      created_at: latestReturn.created_at,
      updated_at: latestReturn.updated_at,
    } : null,
  };
};

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    const { page, limit, offset, paginated } = parsePagination(req.query || {});

    const query = `
      SELECT o.*, 
             u.name as customer_name, u.email as customer_email,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id, u.name, u.email
      ORDER BY o.created_at DESC
      ${paginated ? 'LIMIT $1 OFFSET $2' : ''}
    `;

    const result = paginated
      ? await pool.query(query, [limit, offset])
      : await pool.query(query);

    const total = paginated
      ? Number((await pool.query('SELECT COUNT(*)::int AS total FROM orders')).rows[0]?.total || 0)
      : result.rows.length;

    const orders = result.rows.map(order => ({
      ...mapOrderRecord(order),
      item_count: parseInt(order.item_count)
    }));

    if (paginated) {
      return res.json({
        orders,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    res.json(orders);
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, offset, paginated } = parsePagination(req.query || {});

    const query = `
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      ${paginated ? 'LIMIT $2 OFFSET $3' : ''}
    `;

    const result = paginated
      ? await pool.query(query, [userId, limit, offset])
      : await pool.query(query, [userId]);

    const total = paginated
      ? Number((await pool.query('SELECT COUNT(*)::int AS total FROM orders WHERE user_id = $1', [userId])).rows[0]?.total || 0)
      : result.rows.length;

    const orders = result.rows.map(order => ({
      ...mapOrderRecord(order),
      item_count: parseInt(order.item_count)
    }));

    if (paginated) {
      return res.json({
        orders,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    res.json(orders);
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single order
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isStaff = STAFF_ROLES.has(req.user?.role);

    // Get order
    const orderResult = await pool.query(
      'SELECT o.*, u.name as customer_name, u.email as customer_email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check authorization
    if (!isStaff && order.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT 
         oi.*, 
         COALESCE(oi.product_name, p.name) as product_name,
         p.name as product_name_current,
         p.image as product_image,
         p.part_number as product_part_number,
         p.price as product_price_current,
         p.buying_price as product_buying_price,
         p.box_number as product_box_number,
         p.category_id as product_category_id,
         p.stock_quantity as product_stock_quantity,
         p.low_stock_threshold as product_low_stock_threshold,
         p.sale_price as product_sale_price,
         p.is_on_sale as product_is_on_sale,
         p.sku as product_sku,
         p.barcode as product_barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1`,
      [id]
    );

    const returnInfo = await buildOrderReturnInfo(pool, order, userId, isStaff);

    res.json({
      ...mapOrderRecord(order),
      ...returnInfo,
      items: itemsResult.rows.map(item => ({
        ...item,
        product_price: roundMoney(item.product_price)
      }))
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update order status (admin)
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '').trim().toLowerCase();
  const trackingNumber = normalizeText(req.body?.tracking_number ?? req.body?.trackingNumber);

  if (!VALID_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  if (status === 'delivered' || status === 'completed') {
    return res.status(400).json({
      message: status === 'delivered'
        ? 'Use rider delivery confirmation to mark this order as delivered.'
        : 'Order completion requires customer receipt confirmation.',
    });
  }

  try {
    const orderDetailResult = await pool.query(ORDER_NOTIFICATION_DETAIL_QUERY, [id]);

    if (orderDetailResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderDetail = orderDetailResult.rows[0];
    const currentStatus = String(orderDetail.status || '').toLowerCase();

    if (status === currentStatus) {
      const currentOrderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
      return res.json({
        message: 'Order status unchanged',
        order: currentOrderResult.rows[0],
      });
    }

    if (!canStaffTransitionStatus(currentStatus, status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${currentStatus} to ${status}`,
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           tracking_number = CASE
             WHEN $1 = 'shipped' THEN COALESCE($3, tracking_number)
             ELSE tracking_number
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND status = $4
       RETURNING *`,
      [status, id, trackingNumber, currentStatus]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        message: 'Order status changed by another request. Please refresh and try again.',
      });
    }

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    if (orderDetail.user_id) {
      await createUserNotification(pool, {
        user_id: orderDetail.user_id,
        type: 'order.status',
        title: `Order #${String(orderDetail.order_number || updatedOrder.id).padStart(4, '0')} ${status}`,
        message: orderDetail.product_name
          ? `${buildOrderStatusMessage(status)} Item: ${orderDetail.product_name}.`
          : buildOrderStatusMessage(status),
        reference_id: updatedOrder.id,
        reference_type: 'order',
        thumbnail_url: orderDetail.product_image || null,
        metadata: {
          status,
          order_id: updatedOrder.id,
          order_number: orderDetail.order_number || updatedOrder.id,
          product_id: orderDetail.product_id || null,
          product_name: orderDetail.product_name || null,
        },
      });
    }

    res.json({
      message: 'Order status updated',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const confirmOrderDelivery = async (req, res) => {
  const { id } = req.params;
  const riderId = req.user?.id;

  try {
    const orderDetailResult = await pool.query(ORDER_NOTIFICATION_DETAIL_QUERY, [id]);
    if (orderDetailResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderDetail = orderDetailResult.rows[0];
    const currentStatus = String(orderDetail.status || '').toLowerCase();
    if (currentStatus !== 'shipped') {
      return res.status(400).json({
        message: 'Only shipped orders can be confirmed as delivered by a rider.',
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = 'delivered',
           delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
           rider_confirmed_delivery_at = COALESCE(rider_confirmed_delivery_at, CURRENT_TIMESTAMP),
           rider_confirmed_by = COALESCE(rider_confirmed_by, $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND status = 'shipped'
       RETURNING *`,
      [id, riderId || null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        message: 'Order status changed by another request. Please refresh and try again.',
      });
    }

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    if (orderDetail.user_id) {
      await createUserNotification(pool, {
        user_id: orderDetail.user_id,
        type: 'order.status',
        title: `Order #${String(orderDetail.order_number || updatedOrder.id).padStart(4, '0')} delivered`,
        message: orderDetail.product_name
          ? `${buildOrderStatusMessage('delivered')} Item: ${orderDetail.product_name}.`
          : buildOrderStatusMessage('delivered'),
        reference_id: updatedOrder.id,
        reference_type: 'order',
        thumbnail_url: orderDetail.product_image || null,
        metadata: {
          status: 'delivered',
          order_id: updatedOrder.id,
          order_number: orderDetail.order_number || updatedOrder.id,
          rider_confirmed_by: riderId || null,
          product_id: orderDetail.product_id || null,
          product_name: orderDetail.product_name || null,
        },
      });
    }

    res.json({
      message: 'Delivery confirmed by rider',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Confirm delivery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const confirmOrderReceipt = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const orderDetailResult = await pool.query(ORDER_NOTIFICATION_DETAIL_QUERY, [id]);
    if (orderDetailResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderDetail = orderDetailResult.rows[0];
    if (orderDetail.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const currentStatus = String(orderDetail.status || '').toLowerCase();
    if (currentStatus !== 'delivered') {
      return res.status(400).json({
        message: 'Order can be completed only after rider delivery confirmation.',
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = 'completed',
           delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
           customer_confirmed_receipt_at = COALESCE(customer_confirmed_receipt_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2
         AND status = 'delivered'
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        message: 'Order is no longer eligible for receipt confirmation. Please refresh order details.',
      });
    }

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    await createUserNotification(pool, {
      user_id: userId,
      type: 'order.status',
      title: `Order #${String(orderDetail.order_number || updatedOrder.id).padStart(4, '0')} completed`,
      message: orderDetail.product_name
        ? `${buildOrderStatusMessage('completed')} Item: ${orderDetail.product_name}.`
        : buildOrderStatusMessage('completed'),
      reference_id: updatedOrder.id,
      reference_type: 'order',
      thumbnail_url: orderDetail.product_image || null,
      metadata: {
        status: 'completed',
        order_id: updatedOrder.id,
        order_number: orderDetail.order_number || updatedOrder.id,
        customer_confirmed_receipt_at: updatedOrder.customer_confirmed_receipt_at,
        product_id: orderDetail.product_id || null,
        product_name: orderDetail.product_name || null,
      },
    });

    res.json({
      message: 'Order receipt confirmed. Order completed.',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Confirm receipt error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order (customer - only if not yet shipped/preparing)
export const cancelOrder = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2
         AND status IN ('pending', 'paid')
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      const existingOrder = await pool.query('SELECT user_id, status FROM orders WHERE id = $1', [id]);
      if (existingOrder.rows.length === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const order = existingOrder.rows[0];
      if (order.user_id !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      return res.status(400).json({
        message: 'Order cannot be cancelled once it is being prepared or shipped',
      });
    }

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    res.json({
      message: 'Order cancelled successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const createJntWaybill = async (req, res) => {
  try {
    const order = await createJntWaybillForOrder(pool, req.params.id, { generatedBy: req.user?.id || null });
    res.json({
      message: order.waybill_status === 'generated' ? 'J&T waybill ready' : 'J&T waybill request updated',
      order: mapOrderRecord(order),
    });
  } catch (error) {
    console.error('Create J&T waybill error:', error);
    res.status(error.status || (error.code === 'JNT_NOT_CONFIGURED' ? 503 : 500)).json({
      message: error.message || 'Failed to create J&T waybill',
      code: error.code || 'JNT_WAYBILL_ERROR',
    });
  }
};

export const getOrderWaybill = async (req, res) => {
  try {
    const waybill = await getJntWaybill(pool, req.params.id);
    if (!waybill) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (!waybill.waybill_number || waybill.waybill_status !== 'generated') {
      return res.status(400).json({ message: 'Waybill has not been generated for this order.' });
    }

    const label = waybill.waybill_label_payload || {};
    const recipient = label.recipient || {};
    const sender = label.sender || {};
    const pkg = label.package || {};
    const waybillNumber = waybill.waybill_number;
    const qrDataUrl = label.qr_data_url || '';

    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>J&T Waybill ${escapeHtml(waybillNumber)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111827; background: #f3f4f6; }
          .label { width: 420px; margin: 0 auto; background: #fff; border: 2px solid #111827; }
          .header { display: flex; justify-content: space-between; align-items: center; padding: 14px; border-bottom: 2px solid #111827; }
          .brand { font-size: 24px; font-weight: 800; color: #dc2626; }
          .service { font-size: 12px; font-weight: 700; text-transform: uppercase; }
          .awb { padding: 14px; text-align: center; border-bottom: 2px solid #111827; }
          .awb-value { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
          .qr { width: 150px; height: 150px; margin: 10px auto 0; display: block; }
          .section { padding: 12px 14px; border-bottom: 1px solid #111827; }
          .section h2 { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #4b5563; }
          .section p { margin: 3px 0; font-size: 13px; line-height: 1.35; }
          .footer { display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 11px; }
          .footer div { padding: 10px; border-right: 1px solid #111827; min-height: 48px; }
          .footer div:last-child { border-right: 0; }
          @media print {
            body { padding: 0; background: #fff; }
            .label { margin: 0; width: 100%; border-width: 1px; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">
            <div class="brand">J&amp;T Express</div>
            <div class="service">Waybill</div>
          </div>
          <div class="awb">
            <div class="awb-value">${escapeHtml(waybillNumber)}</div>
            ${qrDataUrl ? `<img class="qr" src="${escapeHtml(qrDataUrl)}" alt="Waybill QR">` : ''}
          </div>
          <div class="section">
            <h2>Receiver</h2>
            <p><strong>${escapeHtml(recipient.name || 'Customer')}</strong></p>
            <p>${escapeHtml(recipient.phone || '')}</p>
            <p>${escapeHtml(recipient.address || '')}</p>
          </div>
          <div class="section">
            <h2>Sender</h2>
            <p><strong>${escapeHtml(sender.name || '10th West Moto')}</strong></p>
            <p>${escapeHtml(sender.phone || '')}</p>
            <p>${escapeHtml(sender.address || '')}</p>
          </div>
          <div class="footer">
            <div><strong>Order</strong><br>${escapeHtml(label.order_number || label.order_id || waybill.id)}</div>
            <div><strong>Weight</strong><br>${escapeHtml(pkg.weight_kg || '')} kg</div>
            <div><strong>Qty</strong><br>${escapeHtml(pkg.qty || '')}</div>
          </div>
        </div>
        <script>window.addEventListener('load', () => window.print());</script>
      </body>
      </html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Get waybill error:', error);
    res.status(500).json({ message: 'Failed to render waybill' });
  }
};

export const refreshJntTracking = async (req, res) => {
  try {
    const waybill = await getJntWaybill(pool, req.params.id);
    if (!waybill) return res.status(404).json({ message: 'Order not found' });
    if (!waybill.waybill_number) return res.status(400).json({ message: 'No J&T waybill exists for this order.' });

    res.json({
      message: 'J&T tracking refresh endpoint is available; configure the contracted tracking API to enable live refresh.',
      tracking_number: waybill.tracking_number,
      waybill_number: waybill.waybill_number,
      courier_metadata: waybill.courier_metadata,
    });
  } catch (error) {
    console.error('Refresh J&T tracking error:', error);
    res.status(500).json({ message: 'Failed to refresh J&T tracking' });
  }
};

// Create order (after payment)
export const createOrder = async (req, res) => {
  const {
    items,
    shipping_address,
    shipping_lat,
    shipping_lng,
    payment_intent_id,
    total_amount,
    discount_amount = 0,
    promo_code_used,
    source = 'online',
    payment_method,
    shipping_method,
    shipping_address_snapshot,
    amount_tendered,
    change_due,
    cashier_id
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = source === 'pos' ? null : req.user?.id;
    const guestInfo = req.body.guest_info;
    const normalizedPaymentIntentId = normalizeText(payment_intent_id);
    const normalizedItems = (items || []).map(item => ({
      product_id: item.product_id ?? item.productId,
      quantity: Number(item.quantity)
    }));
    const resolvedShippingMethod = resolveShippingMethod(shipping_method);

    if (normalizedItems.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    if (source !== 'pos' && !normalizeText(shipping_address)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const initialAddressSnapshot = buildShippingAddressSnapshot(shipping_address_snapshot, shipping_address);
    if (source !== 'pos' && resolvedShippingMethod !== 'pickup') {
      const postalCode = normalizeText(initialAddressSnapshot.postal_code);
      if (!postalCode || !/^\d{4}$/.test(postalCode)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Please correct the highlighted address fields.',
          fieldErrors: { postal_code: 'ZIP code must contain exactly 4 digits.' },
        });
      }

      const addressValidation = await validatePhilippineAddress({
        state: initialAddressSnapshot.state,
        city: initialAddressSnapshot.city,
        barangay: initialAddressSnapshot.barangay,
        province_code: initialAddressSnapshot.province_code,
        city_code: initialAddressSnapshot.city_code,
        barangay_code: initialAddressSnapshot.barangay_code,
      });

      if (!addressValidation.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Please select a valid Philippine shipping address.',
          fieldErrors: addressValidation.fieldErrors,
        });
      }

      Object.assign(initialAddressSnapshot, addressValidation.normalized);
      initialAddressSnapshot.address_string = [
        initialAddressSnapshot.recipient_name,
        initialAddressSnapshot.street,
        initialAddressSnapshot.barangay,
        initialAddressSnapshot.city,
        `${initialAddressSnapshot.state} ${initialAddressSnapshot.postal_code || ''}`.trim(),
        'Philippines',
      ].filter(Boolean).join(', ');
    }

    if (source !== 'pos' && normalizedPaymentIntentId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`order:payment-intent:${normalizedPaymentIntentId}`]);

      const existingOrderResult = await client.query(
        'SELECT id FROM orders WHERE payment_intent_id = $1 LIMIT 1',
        [normalizedPaymentIntentId]
      );

      if (existingOrderResult.rows.length > 0) {
        await client.query('COMMIT');
        return res.status(200).json({
          message: 'Order already processed for this payment intent',
          idempotent: true,
          order_id: existingOrderResult.rows[0].id,
        });
      }
    }

    if (normalizedItems.some(item => !item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid items payload' });
    }

    const uniqueProductIds = [...new Set(normalizedItems.map(item => Number(item.product_id)))];

    const bundleComponentsResult = await client.query(
      `SELECT bc.bundle_product_id, bc.component_product_id, bc.quantity, bc.display_order
       FROM product_bundle_components bc
       WHERE bc.bundle_product_id = ANY($1::int[])`,
      [uniqueProductIds]
    );

    const componentIds = bundleComponentsResult.rows.map((row) => Number(row.component_product_id));
    const lockedProductIds = [...new Set([...uniqueProductIds, ...componentIds])];

    // Lock purchased products and any bundle components in one transaction so stock checks and decrements stay consistent.
    const productSnapshotResult = await client.query(
      `SELECT id, name, price, stock_quantity, product_type, status
       FROM products
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [lockedProductIds]
    );

    const productMap = new Map(productSnapshotResult.rows.map(product => [Number(product.id), product]));
    const bundleComponentsByBundle = new Map();
    for (const component of bundleComponentsResult.rows) {
      const bundleId = Number(component.bundle_product_id);
      if (!bundleComponentsByBundle.has(bundleId)) bundleComponentsByBundle.set(bundleId, []);
      bundleComponentsByBundle.get(bundleId).push({
        component_product_id: Number(component.component_product_id),
        quantity: Number(component.quantity),
      });
    }

    let subtotalAmount = 0;
    const stockDeductionMap = new Map();

    for (const item of normalizedItems) {
      const product = productMap.get(Number(item.product_id));

      if (!product) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Product #${item.product_id} is no longer available.`
        });
      }

      if (String(product.status || '').toLowerCase() !== 'active') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${product.name}: This product is not currently purchasable.`
        });
      }

      const productPrice = toFiniteNumber(product.price, NaN);
      if (!Number.isFinite(productPrice) || productPrice < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${product.name}: Invalid product price. Please contact support.`
        });
      }

      subtotalAmount += roundMoney(productPrice * item.quantity);

      if (String(product.product_type || 'single') === 'bundle') {
        const components = bundleComponentsByBundle.get(Number(product.id)) || [];
        if (components.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `${product.name}: Bundle has no configured components.`
          });
        }

        for (const component of components) {
          const componentProduct = productMap.get(component.component_product_id);
          const requiredQuantity = component.quantity * item.quantity;

          if (!componentProduct) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              message: `${product.name}: A bundle component is no longer available.`
            });
          }

          const nextRequired = (stockDeductionMap.get(component.component_product_id) || 0) + requiredQuantity;
          if (Number(componentProduct.stock_quantity) < nextRequired) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              message: `${product.name}: Maximum available bundle quantity is limited by ${componentProduct.name}.`
            });
          }

          stockDeductionMap.set(component.component_product_id, nextRequired);
        }
      } else {
        const nextRequired = (stockDeductionMap.get(Number(product.id)) || 0) + item.quantity;
        if (Number(product.stock_quantity) < nextRequired) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `${product.name}: Maximum available quantity is ${product.stock_quantity}.`
          });
        }
        stockDeductionMap.set(Number(product.id), nextRequired);
      }
    }

    const normalizedDiscountAmount = Math.min(
      roundMoney(Math.max(0, toFiniteNumber(discount_amount, 0))),
      roundMoney(subtotalAmount)
    );
    const shippingCost = roundMoney(computeShippingCost(roundMoney(subtotalAmount), resolvedShippingMethod));
    const taxableAmount = roundMoney(Math.max(0, roundMoney(subtotalAmount) - normalizedDiscountAmount + shippingCost));
    const vatAmount = roundMoney(taxableAmount * VAT_RATE);
    const computedTotalAmount = roundMoney(taxableAmount + vatAmount);

    const clientTotalAmount = toFiniteNumber(total_amount, NaN);
    if (!Number.isFinite(clientTotalAmount) || clientTotalAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid total amount' });
    }

    // Respect the payment method from the frontend for online orders
    const resolvedPaymentMethod = source === 'pos'
      ? (payment_method || 'cash')
      : (payment_method || 'stripe');
    const resolvedCashierId = source === 'pos' ? (cashier_id || req.user?.id || null) : null;
    const resolvedAddressSnapshot = initialAddressSnapshot;

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, guest_name, guest_email, total_amount, 
        shipping_address, shipping_lat, shipping_lng, payment_intent_id, status, 
        discount_amount, tax_amount, shipping_method, promo_code_used, payment_method, source,
        shipping_address_snapshot,
        amount_tendered, change_due, cashier_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19) 
      RETURNING *`,
      [
        userId,
        guestInfo?.name || null,
        guestInfo?.email || null,
        computedTotalAmount,
        shipping_address,
        shipping_lat ?? null,
        shipping_lng ?? null,
        normalizedPaymentIntentId,
        'paid',
        normalizedDiscountAmount,
        vatAmount,
        resolvedShippingMethod,
        promo_code_used || null,
        resolvedPaymentMethod,
        source,
        JSON.stringify(resolvedAddressSnapshot),
        source === 'pos' ? amount_tendered || null : null,
        source === 'pos' ? change_due || null : null,
        resolvedCashierId
      ]
    );

    let order = orderResult.rows[0];

    // Add order items for purchased products. Stock is deducted from singles or bundle components below.
    const stockUpdates = [];
    for (const item of normalizedItems) {
      const product = productMap.get(Number(item.product_id));

      // Persist product snapshot into order_items so order history stays readable even if product changes later.
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, product.name, roundMoney(product.price), item.quantity]
      );

    }

    for (const [deductProductId, quantityToDeduct] of stockDeductionMap.entries()) {
      const deductionProduct = productMap.get(Number(deductProductId));
      const stockUpdateResult = await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND stock_quantity >= $1
         RETURNING id, name, stock_quantity`,
        [quantityToDeduct, deductProductId]
      );

      if (stockUpdateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${deductionProduct?.name || `Product #${deductProductId}`}: Unable to update stock. Please try checkout again.`
        });
      }

      stockUpdates.push(stockUpdateResult.rows[0]);
    }

    // Clear user's cart if logged in
    if (userId) {
      const cartResult = await client.query(
        'SELECT id FROM carts WHERE user_id = $1',
        [userId]
      );

      if (cartResult.rows.length > 0) {
        await client.query(
          'DELETE FROM cart_items WHERE cart_id = $1 AND product_id = ANY($2::int[])',
          [cartResult.rows[0].id, uniqueProductIds]
        );
      }
    }

    await client.query('COMMIT');

    if (order.source !== 'pos' && order.shipping_method !== 'pickup' && order.status === 'paid') {
      try {
        order = await createJntWaybillForOrder(pool, order.id, { generatedBy: req.user?.id || null });
      } catch (waybillError) {
        console.error('Auto J&T waybill generation failed:', waybillError.message);
        const latestOrderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [order.id]);
        order = latestOrderResult.rows[0] || order;
      }
    }

    const itemsResult = await client.query(
      `SELECT 
         oi.*, 
         COALESCE(oi.product_name, p.name) as product_name,
         p.name as product_name_current,
         p.image as product_image,
         p.part_number as product_part_number,
         p.price as product_price_current,
         p.buying_price as product_buying_price,
         p.box_number as product_box_number,
         p.category_id as product_category_id,
         p.stock_quantity as product_stock_quantity,
         p.low_stock_threshold as product_low_stock_threshold,
         p.sale_price as product_sale_price,
         p.is_on_sale as product_is_on_sale,
         p.sku as product_sku,
         p.barcode as product_barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const fullOrder = {
      ...mapOrderRecord(order),
      items: itemsResult.rows.map(item => ({
        ...item,
        product_price: roundMoney(item.product_price)
      }))
    };

    // Emit real-time events
    emitNewOrder(fullOrder);
    // Emit stock updates for each item
    for (const stockUpdate of stockUpdates) {
      emitStockUpdate({
        product_id: stockUpdate.id,
        stock_quantity: parseInt(stockUpdate.stock_quantity),
        name: stockUpdate.name
      });
    }

    res.status(201).json({
      message: 'Order created successfully',
      order: fullOrder
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error?.code === '23505') {
      const duplicatePaymentIntent = normalizeText(req.body?.payment_intent_id);
      if (duplicatePaymentIntent) {
        const duplicateResult = await pool.query(
          'SELECT id FROM orders WHERE payment_intent_id = $1 LIMIT 1',
          [duplicatePaymentIntent]
        );

        if (duplicateResult.rows.length > 0) {
          return res.status(200).json({
            message: 'Order already processed for this payment intent',
            idempotent: true,
            order_id: duplicateResult.rows[0].id,
          });
        }
      }
    }

    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order' });
  } finally {
    client.release();
  }
};
// Generate invoice HTML for an order
export const getOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isStaff = STAFF_ROLES.has(req.user?.role);

    // Get order
    const orderResult = await pool.query(
      'SELECT o.*, u.name as customer_name, u.email as customer_email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check authorization
    if (!isStaff && order.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.*, COALESCE(oi.product_name, p.name) as product_name, p.part_number
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    const items = itemsResult.rows;

    // Generate invoice HTML (BIR RR 18-2012 compliant)
    const subtotal = roundMoney(items.reduce((sum, item) => {
      const linePrice = roundMoney(item.product_price);
      const quantity = toFiniteNumber(item.quantity, 0);
      return sum + (linePrice * quantity);
    }, 0));
    const discount = roundMoney(order.discount_amount || 0);
    const totalAmount = roundMoney(order.total_amount);
    const vatAmount = roundMoney(toFiniteNumber(order.tax_amount, totalAmount - roundMoney(totalAmount / (1 + VAT_RATE))));
    const vatableSales = roundMoney(totalAmount - vatAmount);

    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice #${order.id}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
          .invoice-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #F97316; padding-bottom: 20px; }
          .company-name { font-size: 28px; font-weight: bold; color: #F97316; }
          .company-info { font-size: 11px; color: #666; margin-top: 6px; line-height: 1.6; }
          .invoice-title { font-size: 20px; margin-top: 10px; }
          .or-number { font-size: 13px; color: #F97316; font-weight: bold; margin-top: 4px; }
          .info-section { display: flex; justify-content: space-between; margin: 30px 0; }
          .info-block { flex: 1; }
          .info-block h3 { font-size: 14px; color: #666; margin-bottom: 10px; }
          .info-block p { font-size: 14px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin: 30px 0; }
          thead { background-color: #F97316; color: white; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { font-weight: bold; }
          .item-description { max-width: 300px; }
          .text-right { text-align: right; }
          .totals { margin-top: 20px; text-align: right; }
          .totals table { width: 300px; margin-left: auto; }
          .totals td { padding: 8px; }
          .totals .grand-total { font-size: 18px; font-weight: bold; background-color: #FFF7ED; }
          .vat-section { font-size: 12px; color: #666; }
          .footer { margin-top: 50px; text-align: center; color: #666; font-size: 11px; padding-top: 20px; border-top: 1px solid #ddd; line-height: 1.8; }
          .legal-note { margin-top: 20px; font-size: 10px; color: #999; text-align: center; border-top: 1px dashed #ddd; padding-top: 15px; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-header">
          <div class="company-name">10TH WEST MOTO</div>
          <div class="company-info">
            Motorcycle Parts &amp; Accessories<br>
            Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104, Philippines<br>
            DTI Reg. No.: 3217456 &nbsp;|&nbsp; BIR TIN: 123-456-789-000 (VAT Registered)
          </div>
          <div class="invoice-title">OFFICIAL RECEIPT / INVOICE</div>
          <div class="or-number">OR No.: OR-${String(order.id).padStart(8, '0')}</div>
        </div>

        <div class="info-section">
          <div class="info-block">
            <h3>SOLD TO:</h3>
            <p>
              <strong>${order.customer_name || 'Customer'}</strong><br>
              ${order.customer_email || ''}<br>
              ${order.shipping_address ? order.shipping_address.replace(/\n/g, '<br>') : ''}
            </p>
          </div>
          <div class="info-block">
            <h3>INVOICE DETAILS:</h3>
            <p>
              <strong>Invoice #:</strong> ${order.id}<br>
              <strong>OR No.:</strong> OR-${String(order.id).padStart(8, '0')}<br>
              <strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
              <strong>Payment Method:</strong> ${order.payment_method || 'N/A'}<br>
              <strong>Status:</strong> ${order.status.toUpperCase()}
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Part Number</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td class="item-description">${item.product_name || 'Product'}</td>
                <td>${item.part_number || '-'}</td>
                <td class="text-right">₱${roundMoney(item.product_price).toFixed(2)}</td>
                <td class="text-right">${toFiniteNumber(item.quantity, 0)}</td>
                <td class="text-right">₱${roundMoney(roundMoney(item.product_price) * toFiniteNumber(item.quantity, 0)).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
 
        <div class="totals">
          <table>
            <tr class="vat-section">
              <td>VATable Sales:</td>
              <td class="text-right">₱${vatableSales.toFixed(2)}</td>
            </tr>
            <tr class="vat-section">
              <td>VAT (12%):</td>
              <td class="text-right">₱${vatAmount.toFixed(2)}</td>
            </tr>
            ${discount > 0 ? `
            <tr>
              <td>Discount:</td>
              <td class="text-right">-₱${discount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr class="grand-total">
              <td><strong>TOTAL (VAT Inclusive):</strong></td>
              <td class="text-right"><strong>₱${totalAmount.toFixed(2)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <p><strong>10th West Moto Parts</strong></p>
          <p>Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104</p>
          <p>BIR TIN: 123-456-789-000 &nbsp;|&nbsp; DTI Reg. No.: 3217456</p>
          <p>Phone: (02) 8888-1234 &nbsp;|&nbsp; Email: support@10thwestmoto.com</p>
          <p>Thank you for your business!</p>
        </div>

        <div class="legal-note">
          <p>This document serves as an Official Receipt per BIR Revenue Regulations No. 18-2012.</p>
          <p>For returns, you may return products within 7 days of delivery per DTI DAO 21-01.</p>
          <p>For questions, contact returns@10thwestmoto.com or call (02) 8888-1234.</p>
        </div>
      </body>
      </html>
    `;

    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(invoiceHTML);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
};
