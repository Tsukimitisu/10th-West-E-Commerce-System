import crypto from 'crypto';
import pool from '../config/database.js';
import { createJntWaybillForOrder, getJntWaybill } from '../services/jntShipments.js';
import { emitOrderStatusUpdate } from '../socket.js';

const SHIPMENT_TO_ORDER = {
  picked_up: 'shipped', in_transit: 'shipped', out_for_delivery: 'out_for_delivery',
  delivered: 'delivered', failed: 'failed', returned: 'returned',
};

export const bookShipment = async (req, res) => {
  const orderId = Number(req.body?.order_id);
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Valid order_id is required.' });
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key)) return res.status(400).json({ message: 'A valid Idempotency-Key header is required.' });
  try {
    const existing = await pool.query(`SELECT * FROM shipments WHERE order_id = $1`, [orderId]);
    if (existing.rows[0] && existing.rows[0].booking_idempotency_key !== key) {
      return res.status(409).json({ message: 'This order already has a courier booking.' });
    }
    if (existing.rows[0]?.tracking_number) return res.json(existing.rows[0]);
    const order = await pool.query(`SELECT id, status, payment_method, payment_status, shipping_fee FROM orders WHERE id = $1`, [orderId]);
    if (!order.rows[0]) return res.status(404).json({ message: 'Order not found.' });
    if (order.rows[0].payment_method !== 'cod' && order.rows[0].payment_status !== 'paid') {
      return res.status(409).json({ message: 'Online payment must be verified before courier booking.' });
    }
    if (!['paid', 'processing', 'packed', 'ready_for_pickup'].includes(order.rows[0].status)) {
      return res.status(409).json({ message: 'Order is not ready for courier booking.' });
    }
    await pool.query(
      `INSERT INTO shipments (order_id, provider, status, shipping_fee, booking_idempotency_key)
       VALUES ($1,'jnt','pending',$2,$3) ON CONFLICT (order_id) DO NOTHING`,
      [orderId, order.rows[0].shipping_fee, key]
    );
    try {
      const booked = await createJntWaybillForOrder(pool, orderId, { generatedBy: req.user.id });
      const shipment = await pool.query(
        `UPDATE shipments SET status = 'booked', provider_shipment_id = $2, tracking_number = $2, booked_at = NOW(), updated_at = NOW()
         WHERE order_id = $1 RETURNING *`,
        [orderId, booked.tracking_number || booked.waybill_number]
      );
      await pool.query(
        `INSERT INTO waybills (order_id, shipment_id, waybill_number, label_payload, generated_by)
         VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (order_id) DO NOTHING`,
        [orderId, shipment.rows[0].id, booked.waybill_number, JSON.stringify(booked.waybill_label_payload), req.user.id]
      );
      return res.status(201).json(shipment.rows[0]);
    } catch (error) {
      await pool.query(`UPDATE shipments SET status = 'failed', provider_metadata = $2::jsonb, updated_at = NOW() WHERE order_id = $1`, [orderId, JSON.stringify({ error: error.message })]);
      throw error;
    }
  } catch (error) {
    console.error('Shipment booking failed:', error);
    return res.status(error.status || (error.code === 'JNT_NOT_CONFIGURED' ? 503 : 500)).json({ message: error.message || 'Shipment booking failed.' });
  }
};

const secureCompare = (left, right) => {
  try { return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex')); } catch { return false; }
};

export const shipmentWebhook = async (req, res) => {
  const secret = String(process.env.COURIER_WEBHOOK_SECRET || '').trim();
  const signature = String(req.get('X-Courier-Signature') || '').trim();
  if (!secret || !req.rawBody || !signature) return res.status(400).json({ message: 'Invalid courier signature.' });
  const digest = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  if (!secureCompare(digest, signature)) return res.status(400).json({ message: 'Invalid courier signature.' });
  const tracking = String(req.body?.tracking_number || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const eventId = String(req.body?.event_id || '').trim();
  const occurredAt = new Date(req.body?.occurred_at || Date.now());
  if (!tracking || !eventId || !SHIPMENT_TO_ORDER[status] || Number.isNaN(occurredAt.getTime())) {
    return res.status(400).json({ message: 'Malformed courier event.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const shipmentResult = await client.query(`SELECT * FROM shipments WHERE tracking_number = $1 FOR UPDATE`, [tracking]);
    const shipment = shipmentResult.rows[0];
    if (!shipment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Shipment not found.' });
    }
    const inserted = await client.query(
      `INSERT INTO shipment_events (shipment_id, provider_event_id, status, location, description, payload, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (shipment_id, provider_event_id) DO NOTHING RETURNING id`,
      [shipment.id, eventId, status, req.body?.location || null, req.body?.description || null, JSON.stringify(req.body), occurredAt]
    );
    if (!inserted.rowCount) { await client.query('COMMIT'); return res.json({ message: 'Event already processed.' }); }
    await client.query(`UPDATE shipments SET status = $2, updated_at = NOW() WHERE id = $1`, [shipment.id, status]);
    const order = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [shipment.order_id]);
    const nextOrderStatus = SHIPMENT_TO_ORDER[status];
    if (order.rows[0]?.status !== nextOrderStatus) {
      await client.query(`UPDATE orders SET status = $2, delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END, updated_at = NOW() WHERE id = $1`, [shipment.order_id, nextOrderStatus]);
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, source, note, metadata) VALUES ($1,$2,$3,'courier',$4,$5::jsonb)`,
        [shipment.order_id, order.rows[0]?.status, nextOrderStatus, req.body?.description || status, JSON.stringify({ event_id: eventId })]
      );
    }
    await client.query('COMMIT');
    emitOrderStatusUpdate(shipment.order_id, nextOrderStatus);
    return res.json({ message: 'SUCCESS' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Courier webhook failed:', error);
    return res.status(500).json({ message: 'Courier event processing failed.' });
  } finally { client.release(); }
};

export const getTracking = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    const shipment = await pool.query(
      `SELECT s.* FROM shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.order_id = $1 AND ($2::boolean OR o.user_id = $3)`,
      [orderId, staff, req.user.id]
    );
    if (!shipment.rowCount) return res.status(404).json({ message: 'Shipment not found.' });
    const events = await pool.query(`SELECT status, location, description, occurred_at FROM shipment_events WHERE shipment_id = $1 ORDER BY occurred_at, id`, [shipment.rows[0].id]);
    return res.json({ shipment: shipment.rows[0], events: events.rows });
  } catch (error) {
    return res.status(500).json({ message: 'Tracking could not be loaded.' });
  }
};

export const getShipmentDetail = getTracking;

export const cancelShipment = async (req, res) => {
  const orderId = Number(req.params.orderId || req.body?.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Valid order ID is required.' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500) || 'Shipment cancelled by staff';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM shipments WHERE order_id = $1 FOR UPDATE`, [orderId]);
    const shipment = result.rows[0];
    if (!shipment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Shipment not found.' });
    }
    if (['delivered', 'cancelled', 'returned'].includes(shipment.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This shipment can no longer be cancelled.' });
    }
    if (shipment.provider_shipment_id && !['pending', 'failed'].includes(shipment.status)) {
      await client.query('ROLLBACK');
      return res.status(501).json({ message: 'Courier-side cancellation is not configured for booked J&T shipments.' });
    }
    await client.query(
      `UPDATE shipments SET status = 'cancelled', cancelled_at = NOW(), provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [shipment.id, JSON.stringify({ cancel_reason: reason, cancelled_by: req.user.id })]
    );
    await client.query(
      `INSERT INTO shipment_events (shipment_id, provider_event_id, status, description, payload, occurred_at)
       VALUES ($1, $2, 'cancelled', $3, $4::jsonb, NOW())
       ON CONFLICT (shipment_id, provider_event_id) DO NOTHING`,
      [shipment.id, `local-cancel-${shipment.id}`, reason, JSON.stringify({ reason, cancelled_by: req.user.id })]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1, 'shipment.cancel', 'shipment', $2, $3, $4, $5::jsonb)`,
      [req.user.id, String(shipment.id), req.ip, req.get('user-agent'), JSON.stringify({ order_id: orderId, reason })]
    );
    await client.query('COMMIT');
    return res.json({ message: 'Shipment cancelled.', order_id: orderId, status: 'cancelled' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cancel shipment failed:', error);
    return res.status(500).json({ message: 'Shipment could not be cancelled.' });
  } finally { client.release(); }
};

export const generateWaybill = async (req, res) => {
  req.body = { ...req.body, order_id: Number(req.params.orderId) };
  return bookShipment(req, res);
};

export const printWaybill = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const result = await pool.query(`SELECT * FROM waybills WHERE order_id = $1`, [orderId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Waybill not found.' });
    await pool.query(`UPDATE waybills SET reprint_count = reprint_count + 1, last_printed_at = NOW(), updated_at = NOW() WHERE id = $1`, [result.rows[0].id]);
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent) VALUES ($1,'waybill.print','waybill',$2,$3,$4)`,
      [req.user.id, String(result.rows[0].id), req.ip, req.get('user-agent')]
    );
    return res.json({ ...result.rows[0], print_instructions: 'Render this label payload in the protected staff print view.' });
  } catch (error) { return res.status(500).json({ message: 'Waybill could not be loaded.' }); }
};

export const getWaybill = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ message: 'Invalid order ID.' });
    const result = await pool.query(
      `SELECT w.*, s.provider, s.tracking_number, s.status AS shipment_status
       FROM waybills w
       LEFT JOIN shipments s ON s.id = w.shipment_id
       WHERE w.order_id = $1`,
      [orderId]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Waybill not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Get waybill failed:', error);
    return res.status(500).json({ message: 'Waybill could not be loaded.' });
  }
};
