import pool from '../config/database.js';
import { emitOrderStatusUpdate } from '../socket.js';
import {
  calculateRates as calculateProviderRates,
  cancelShipment as cancelProviderShipment,
  createShipment,
  generateWaybill as generateProviderWaybill,
} from '../services/shipping/shippingService.js';
import { publicProviderError } from '../services/shipping/providerError.js';
import {
  getSelectedShippingProviderName,
} from '../services/shipping/providers/index.js';
import {
  getSelectedTrackingProviderName,
} from '../services/tracking/providers/index.js';
import {
  getTrackingStatus,
  handleTrackingWebhook,
  registerTracking,
} from '../services/tracking/trackingService.js';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'owner', 'store_staff']);
const SHIPMENT_TO_ORDER = {
  picked_up: 'shipped',
  in_transit: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  failed: 'failed',
  failed_delivery: 'failed',
  returned: 'returned',
};

const validOrderId = (value) => {
  const orderId = Number(value);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
};

const providerFailure = (res, error, fallback) => {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    ...publicProviderError(error),
    message: error?.message || fallback,
  });
};

const safeShipment = (shipment) => ({
  id: shipment.id,
  order_id: shipment.order_id,
  shipping_provider: shipment.shipping_provider,
  tracking_provider: shipment.tracking_provider,
  status: shipment.normalized_status || shipment.status,
  provider_status: shipment.provider_status,
  provider_shipment_id: shipment.provider_shipment_id,
  provider_tracking_id: shipment.provider_tracking_id,
  tracking_number: shipment.tracking_number,
  waybill_number: shipment.waybill_number,
  label_url: shipment.label_url,
  shipping_fee: shipment.shipping_fee,
  currency: shipment.currency,
  booked_at: shipment.booked_at,
  cancelled_at: shipment.cancelled_at,
  last_tracking_refresh_at: shipment.last_tracking_refresh_at,
  booking_error: shipment.booking_error,
  created_at: shipment.created_at,
  updated_at: shipment.updated_at,
});

const loadOrderPayload = async (orderId) => {
  const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!orderResult.rowCount) return null;
  const items = await pool.query(
    `SELECT oi.*, p.name AS product_name, p.shipping_weight_kg, p.shipping_dimensions
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );
  return { order: orderResult.rows[0], items: items.rows };
};

const assertBookable = (order) => {
  if (order.payment_method !== 'cod' && order.payment_status !== 'paid') {
    const error = new Error('Online payment must be verified before shipment booking.');
    error.status = 409;
    throw error;
  }
  if (!['paid', 'processing', 'packed', 'ready_for_pickup'].includes(order.status)) {
    const error = new Error('Order is not ready for shipment booking.');
    error.status = 409;
    throw error;
  }
  if (String(order.shipping_method || '').toLowerCase() === 'pickup') {
    const error = new Error('Pickup orders do not require shipment booking.');
    error.status = 409;
    throw error;
  }
};

const writeAudit = (client, req, action, entityType, entityId, metadata = {}) => client.query(
  `INSERT INTO audit_logs
    (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
  [
    req.user?.id || null,
    action,
    entityType,
    String(entityId),
    req.ip,
    req.get('user-agent'),
    JSON.stringify(metadata),
  ]
);

const insertEvents = async (client, shipmentId, events, source) => {
  for (const [index, event] of events.entries()) {
    const occurredAt = new Date(event.occurredAt || Date.now());
    if (Number.isNaN(occurredAt.getTime())) continue;
    const eventId = String(event.eventId || `${source}-${shipmentId}-${occurredAt.toISOString()}-${index}`).slice(0, 255);
    await client.query(
      `INSERT INTO shipment_events
        (shipment_id, provider_event_id, status, location, description, payload, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (shipment_id, provider_event_id) DO NOTHING`,
      [
        shipmentId,
        eventId,
        String(event.status || 'pending').slice(0, 40),
        event.location ? String(event.location).slice(0, 255) : null,
        event.description ? String(event.description).slice(0, 2000) : null,
        JSON.stringify({ source, simulated: event.simulated === true }),
        occurredAt,
      ]
    );
  }
};

const recordProviderError = async (shipmentId, operation, error) => {
  if (!shipmentId) return;
  await pool.query(
    `INSERT INTO shipment_events
      (shipment_id, provider_event_id, status, description, payload, occurred_at)
     VALUES ($1,$2,'provider_error',$3,$4::jsonb,NOW())
     ON CONFLICT (shipment_id, provider_event_id) DO NOTHING`,
    [
      shipmentId,
      `provider-error-${operation}-${Date.now()}`,
      String(error?.message || 'Provider request failed').slice(0, 2000),
      JSON.stringify({
        operation,
        code: error?.code || 'PROVIDER_ERROR',
        provider: error?.provider || null,
      }),
    ]
  ).catch(() => {});
};

const applyTrackingResult = async (shipment, tracking, { webhook = false } = {}) => {
  const normalizedStatus = String(tracking.normalizedStatus || 'pending');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertEvents(client, shipment.id, tracking.events || [], tracking.provider || shipment.tracking_provider);
    await client.query(
      `UPDATE shipments
       SET tracking_provider = COALESCE($2, tracking_provider),
           provider_tracking_id = COALESCE($3, provider_tracking_id),
           tracking_number = COALESCE($4, tracking_number),
           provider_status = COALESCE($5, provider_status),
           normalized_status = $6,
           status = $6,
           last_tracking_refresh_at = CASE WHEN $7::boolean THEN last_tracking_refresh_at ELSE NOW() END,
           webhook_received_at = CASE WHEN $7::boolean THEN NOW() ELSE webhook_received_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [
        shipment.id,
        tracking.provider || shipment.tracking_provider,
        tracking.providerTrackingId || null,
        tracking.trackingNumber || null,
        tracking.providerStatus || null,
        normalizedStatus,
        webhook,
      ]
    );

    const nextOrderStatus = SHIPMENT_TO_ORDER[normalizedStatus];
    let previousOrderStatus = null;
    if (nextOrderStatus) {
      const order = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [shipment.order_id]);
      previousOrderStatus = order.rows[0]?.status || null;
      if (previousOrderStatus && previousOrderStatus !== nextOrderStatus) {
        await client.query(
          `UPDATE orders
           SET status = $2,
               delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
               updated_at = NOW()
           WHERE id = $1`,
          [shipment.order_id, nextOrderStatus]
        );
        await client.query(
          `INSERT INTO order_status_history
            (order_id, from_status, to_status, source, note, metadata)
           VALUES ($1,$2,$3,'courier',$4,$5::jsonb)`,
          [
            shipment.order_id,
            previousOrderStatus,
            nextOrderStatus,
            `Tracking provider reported ${normalizedStatus}`,
            JSON.stringify({ tracking_provider: tracking.provider || shipment.tracking_provider }),
          ]
        );
      }
    }
    await client.query('COMMIT');
    if (nextOrderStatus && previousOrderStatus !== nextOrderStatus) {
      emitOrderStatusUpdate(shipment.order_id, nextOrderStatus, {
        previous_status: previousOrderStatus,
        shipment_status: normalizedStatus,
      });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const calculateRates = async (req, res) => {
  const orderId = validOrderId(req.body?.order_id);
  if (!orderId) return res.status(400).json({ message: 'Valid order_id is required.' });
  try {
    const payload = await loadOrderPayload(orderId);
    if (!payload) return res.status(404).json({ message: 'Order not found.' });
    assertBookable(payload.order);
    const rates = await calculateProviderRates(payload);
    return res.json({ provider: getSelectedShippingProviderName(), rates });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ message: error.message });
    console.error('Shipment rate calculation failed:', error.code || error.message);
    return providerFailure(res, error, 'Shipment rates could not be calculated.');
  }
};

export const bookShipment = async (req, res) => {
  const orderId = validOrderId(req.body?.order_id);
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!orderId) return res.status(400).json({ message: 'Valid order_id is required.' });
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key)) {
    return res.status(400).json({ message: 'A valid Idempotency-Key header is required.' });
  }

  let shipmentId = null;
  let providerBooked = false;
  try {
    const existing = await pool.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]);
    if (existing.rows[0] && existing.rows[0].booking_idempotency_key !== key) {
      return res.status(409).json({ message: 'This order already has a shipment booking attempt.' });
    }
    if (existing.rows[0]?.provider_shipment_id) return res.json(safeShipment(existing.rows[0]));

    const payload = await loadOrderPayload(orderId);
    if (!payload) return res.status(404).json({ message: 'Order not found.' });
    assertBookable(payload.order);

    const shippingProvider = getSelectedShippingProviderName();
    const trackingProvider = getSelectedTrackingProviderName();
    const inserted = await pool.query(
      `INSERT INTO shipments
        (order_id, provider, shipping_provider, tracking_provider, status, normalized_status,
         shipping_fee, booking_idempotency_key)
       VALUES ($1,$2,$2,$3,'pending','pending',$4,$5)
       ON CONFLICT (order_id) DO UPDATE
       SET provider = EXCLUDED.provider,
           shipping_provider = EXCLUDED.shipping_provider,
           tracking_provider = EXCLUDED.tracking_provider,
           updated_at = NOW()
       RETURNING *`,
      [orderId, shippingProvider, trackingProvider, payload.order.shipping_fee || 0, key]
    );
    shipmentId = inserted.rows[0].id;

    const booked = await createShipment(payload);
    providerBooked = true;
    let trackingRegistration = null;
    let trackingWarning = null;
    try {
      trackingRegistration = await registerTracking({
        trackingNumber: booked.trackingNumber,
        providerShipmentId: booked.providerShipmentId,
        courierSlug: booked.courierSlug,
        orderId,
      });
    } catch (error) {
      trackingWarning = publicProviderError(error);
    }

    const updated = await pool.query(
      `UPDATE shipments
       SET status = $2,
           normalized_status = $2,
           provider_status = $3,
           provider_shipment_id = $4,
           tracking_number = $5,
           provider_tracking_id = $6,
           provider_metadata = $7::jsonb,
           booking_error = $8,
           booked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        shipmentId,
        booked.normalizedStatus || 'booked',
        booked.providerStatus || null,
        booked.providerShipmentId || null,
        booked.trackingNumber || null,
        trackingRegistration?.providerTrackingId || null,
        JSON.stringify({ simulated: booked.simulated === true }),
        trackingWarning?.message || null,
      ]
    );
    await pool.query(
      `UPDATE orders
       SET courier = $2, tracking_number = $3, updated_at = NOW()
       WHERE id = $1`,
      [orderId, shippingProvider, booked.trackingNumber || null]
    );
    await writeAudit(pool, req, 'shipment.book', 'shipment', shipmentId, {
      order_id: orderId,
      shipping_provider: shippingProvider,
      tracking_provider: trackingProvider,
      simulated: booked.simulated === true,
    });
    return res.status(201).json({
      shipment: safeShipment(updated.rows[0]),
      tracking_registration: trackingRegistration
        ? { status: 'registered', provider: trackingProvider }
        : { status: 'unavailable', error: trackingWarning },
    });
  } catch (error) {
    if (shipmentId) {
      if (providerBooked) {
        await pool.query(
          `UPDATE shipments SET booking_error = $2, updated_at = NOW() WHERE id = $1`,
          [shipmentId, String(error.message || 'Local shipment finalization failed').slice(0, 2000)]
        ).catch(() => {});
      } else {
        await pool.query(
          `UPDATE shipments
           SET status = 'failed', normalized_status = 'failed', booking_error = $2, updated_at = NOW()
           WHERE id = $1`,
          [shipmentId, String(error.message || 'Provider request failed').slice(0, 2000)]
        ).catch(() => {});
      }
      await recordProviderError(shipmentId, 'booking', error);
    }
    if (error.status === 409) return res.status(409).json({ message: error.message });
    console.error('Shipment booking failed:', error.code || error.message);
    return providerFailure(res, error, 'Shipment booking failed.');
  }
};

export const shipmentWebhook = async (req, res) => {
  try {
    const result = await handleTrackingWebhook({
      rawBody: req.rawBody,
      body: req.body,
      headers: req.headers,
    });
    const tracking = result.tracking || {};
    const trackingNumber = tracking.trackingNumber;
    const providerTrackingId = tracking.providerTrackingId;
    if (!trackingNumber && !providerTrackingId) {
      return res.status(400).json({ message: 'Tracking webhook does not identify a shipment.' });
    }
    const shipmentResult = await pool.query(
      `SELECT * FROM shipments
       WHERE ($1::text IS NOT NULL AND tracking_number = $1)
          OR ($2::text IS NOT NULL AND provider_tracking_id = $2)
       ORDER BY id DESC
       LIMIT 1`,
      [trackingNumber || null, providerTrackingId || null]
    );
    if (!shipmentResult.rowCount) return res.status(404).json({ message: 'Shipment not found.' });
    await applyTrackingResult(shipmentResult.rows[0], {
      ...tracking,
      events: result.events || tracking.events || [],
    }, { webhook: true });
    return res.json({ message: 'SUCCESS' });
  } catch (error) {
    console.error('Tracking webhook failed:', error.code || error.message);
    return providerFailure(res, error, 'Tracking webhook could not be processed.');
  }
};

export const getTracking = async (req, res) => {
  const orderId = validOrderId(req.params.orderId);
  if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const staff = STAFF_ROLES.has(req.user.role);
    const shipment = await pool.query(
      `SELECT s.* FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.order_id = $1 AND ($2::boolean OR o.user_id = $3)`,
      [orderId, staff, req.user.id]
    );
    if (!shipment.rowCount) return res.status(404).json({ message: 'Shipment not found.' });
    const events = await pool.query(
      `SELECT status, location, description, occurred_at
       FROM shipment_events
       WHERE shipment_id = $1
       ORDER BY occurred_at, id`,
      [shipment.rows[0].id]
    );
    return res.json({ shipment: safeShipment(shipment.rows[0]), events: events.rows });
  } catch (error) {
    console.error('Get tracking failed:', error.message);
    return res.status(500).json({ message: 'Tracking could not be loaded.' });
  }
};

export const getShipmentDetail = getTracking;

export const refreshTracking = async (req, res) => {
  const orderId = validOrderId(req.params.orderId);
  if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const result = await pool.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]);
    const shipment = result.rows[0];
    if (!shipment) return res.status(404).json({ message: 'Shipment not found.' });
    if (!shipment.tracking_number) return res.status(409).json({ message: 'Shipment has no tracking number.' });
    const tracking = await getTrackingStatus({
      providerTrackingId: shipment.provider_tracking_id,
      providerShipmentId: shipment.provider_shipment_id,
      trackingNumber: shipment.tracking_number,
    });
    await applyTrackingResult(shipment, tracking);
    await writeAudit(pool, req, 'shipment.tracking_refresh', 'shipment', shipment.id, {
      order_id: orderId,
      tracking_provider: shipment.tracking_provider,
    });
    const refreshed = await pool.query('SELECT * FROM shipments WHERE id = $1', [shipment.id]);
    return res.json({ shipment: safeShipment(refreshed.rows[0]), events: tracking.events || [] });
  } catch (error) {
    const failedShipment = await pool.query(
      'SELECT id FROM shipments WHERE order_id = $1',
      [orderId]
    ).catch(() => ({ rows: [] }));
    await recordProviderError(failedShipment.rows[0]?.id, 'tracking_refresh', error);
    console.error('Tracking refresh failed:', error.code || error.message);
    return providerFailure(res, error, 'Tracking could not be refreshed.');
  }
};

export const cancelShipment = async (req, res) => {
  const orderId = validOrderId(req.params.orderId || req.body?.order_id);
  if (!orderId) return res.status(400).json({ message: 'Valid order ID is required.' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500) || 'Shipment cancelled by staff';
  try {
    const result = await pool.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]);
    const shipment = result.rows[0];
    if (!shipment) return res.status(404).json({ message: 'Shipment not found.' });
    if (['delivered', 'cancelled', 'returned'].includes(shipment.normalized_status || shipment.status)) {
      return res.status(409).json({ message: 'This shipment can no longer be cancelled.' });
    }
    await cancelProviderShipment({
      orderId,
      providerShipmentId: shipment.provider_shipment_id,
      trackingNumber: shipment.tracking_number,
      reason,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE shipments
         SET status = 'cancelled', normalized_status = 'cancelled', provider_status = 'cancelled',
             cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [shipment.id]
      );
      await insertEvents(client, shipment.id, [{
        eventId: `cancel-${shipment.id}-${Date.now()}`,
        status: 'cancelled',
        description: reason,
        occurredAt: new Date().toISOString(),
      }], shipment.shipping_provider);
      await writeAudit(client, req, 'shipment.cancel', 'shipment', shipment.id, { order_id: orderId, reason });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return res.json({ message: 'Shipment cancelled.', order_id: orderId, status: 'cancelled' });
  } catch (error) {
    const failedShipment = await pool.query(
      'SELECT id FROM shipments WHERE order_id = $1',
      [orderId]
    ).catch(() => ({ rows: [] }));
    await recordProviderError(failedShipment.rows[0]?.id, 'cancellation', error);
    console.error('Shipment cancellation failed:', error.code || error.message);
    return providerFailure(res, error, 'Shipment could not be cancelled.');
  }
};

export const generateWaybill = async (req, res) => {
  const orderId = validOrderId(req.params.orderId);
  if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const existing = await pool.query(
      `SELECT w.*, s.shipping_provider, s.tracking_number, s.provider_shipment_id,
              s.id AS linked_shipment_id, s.status AS shipment_status
       FROM shipments s
       LEFT JOIN waybills w ON w.shipment_id = s.id
       WHERE s.order_id = $1`,
      [orderId]
    );
    const shipment = existing.rows[0];
    if (!shipment) return res.status(409).json({ message: 'Book the shipment before generating a waybill.' });
    if (shipment.waybill_number) return res.json(shipment);
    if (!shipment.provider_shipment_id) {
      return res.status(409).json({ message: 'Shipment booking must succeed before waybill generation.' });
    }
    const payload = await loadOrderPayload(orderId);
    const generated = await generateProviderWaybill({
      ...payload,
      shipment: {
        id: shipment.linked_shipment_id,
        provider_shipment_id: shipment.provider_shipment_id,
        tracking_number: shipment.tracking_number,
      },
    });
    if (!generated.waybillNumber || (!generated.labelPayload && !generated.labelUrl)) {
      const error = new Error('Shipping provider did not return a usable waybill label.');
      error.code = 'INVALID_PROVIDER_RESPONSE';
      error.status = 502;
      throw error;
    }
    const inserted = await pool.query(
      `INSERT INTO waybills
        (order_id, shipment_id, waybill_number, status, label_payload, label_url, provider, generated_by)
       VALUES ($1,$2,$3,'generated',$4::jsonb,$5,$6,$7)
       ON CONFLICT (order_id) DO UPDATE
       SET waybill_number = EXCLUDED.waybill_number,
           label_payload = EXCLUDED.label_payload,
           label_url = EXCLUDED.label_url,
           provider = EXCLUDED.provider,
           status = 'generated',
           updated_at = NOW()
       RETURNING *`,
      [
        orderId,
        shipment.linked_shipment_id,
        generated.waybillNumber,
        JSON.stringify(generated.labelPayload || { label_url: generated.labelUrl }),
        generated.labelUrl || null,
        generated.provider || shipment.shipping_provider,
        req.user.id,
      ]
    );
    await pool.query(
      `UPDATE shipments
       SET waybill_number = $2, label_url = $3, updated_at = NOW()
       WHERE id = $1`,
      [shipment.linked_shipment_id, generated.waybillNumber, generated.labelUrl || null]
    );
    await pool.query(
      `UPDATE orders
       SET courier = $2, waybill_number = $3, waybill_status = 'generated',
           waybill_generated_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [orderId, generated.provider || shipment.shipping_provider, generated.waybillNumber]
    );
    await writeAudit(pool, req, 'waybill.generate', 'waybill', inserted.rows[0].id, {
      order_id: orderId,
      provider: generated.provider || shipment.shipping_provider,
      simulated: generated.simulated === true,
    });
    return res.status(201).json(inserted.rows[0]);
  } catch (error) {
    const failedShipment = await pool.query(
      'SELECT id FROM shipments WHERE order_id = $1',
      [orderId]
    ).catch(() => ({ rows: [] }));
    await recordProviderError(failedShipment.rows[0]?.id, 'waybill_generation', error);
    console.error('Waybill generation failed:', error.code || error.message);
    return providerFailure(res, error, 'Waybill could not be generated.');
  }
};

export const getWaybill = async (req, res) => {
  const orderId = validOrderId(req.params.orderId);
  if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const result = await pool.query(
      `SELECT w.*, s.shipping_provider, s.tracking_number,
              COALESCE(s.normalized_status, s.status) AS shipment_status
       FROM waybills w
       LEFT JOIN shipments s ON s.id = w.shipment_id
       WHERE w.order_id = $1`,
      [orderId]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Waybill not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Get waybill failed:', error.message);
    return res.status(500).json({ message: 'Waybill could not be loaded.' });
  }
};

const recordWaybillOutput = async (req, res, action) => {
  const orderId = validOrderId(req.params.orderId);
  if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
  try {
    const result = await pool.query('SELECT * FROM waybills WHERE order_id = $1', [orderId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Waybill not found.' });
    const waybill = result.rows[0];
    await pool.query(
      `UPDATE waybills
       SET reprint_count = reprint_count + 1,
           last_printed_at = NOW(),
           last_reprinted_at = CASE WHEN $2 = 'reprint' THEN NOW() ELSE last_reprinted_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [waybill.id, action]
    );
    await writeAudit(pool, req, `waybill.${action}`, 'waybill', waybill.id, { order_id: orderId });
    return res.json({
      ...waybill,
      print_instructions: 'Render this provider label in the protected staff print view.',
    });
  } catch (error) {
    console.error(`Waybill ${action} failed:`, error.message);
    return res.status(500).json({ message: 'Waybill could not be loaded.' });
  }
};

export const printWaybill = (req, res) => recordWaybillOutput(req, res, 'print');
export const reprintWaybill = (req, res) => recordWaybillOutput(req, res, 'reprint');
