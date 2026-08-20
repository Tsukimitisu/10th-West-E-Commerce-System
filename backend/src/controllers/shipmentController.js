import pool from '../config/database.js';
import { STAFF_ROLE_SET } from '../constants/schemaEnums.js';
import { createOrderWorkflowNotification } from '../utils/notifications.js';
import { writeAuditLog } from '../utils/audit.js';

export const MANUAL_SHIPMENT_STATUSES = Object.freeze([
  'pending',
  'waybill_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
  'cancelled',
  'returned',
]);

const MANUAL_SHIPMENT_STATUS_SET = new Set(MANUAL_SHIPMENT_STATUSES);
const COD_WAYBILL_STATUSES = new Set(['confirmed', 'paid', 'processing', 'packed', 'ready_for_pickup']);
const ACTIVE_SHIPMENT_STATUSES = new Set(['cancelled', 'returned']);

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

const positiveId = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw fail(400, `Invalid ${label}.`, 'INVALID_ID');
  return parsed;
};

const cleanText = (value, { field, required = false, max = 1000, pattern = null } = {}) => {
  const text = String(value ?? '').trim();
  if (required && !text) throw fail(400, `${field} is required.`, 'VALIDATION_ERROR');
  if (text.length > max || (text && pattern && !pattern.test(text))) {
    throw fail(400, `${field} is invalid.`, 'VALIDATION_ERROR');
  }
  return text || null;
};

export const validateManualWaybillInput = (body = {}) => {
  const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{5,99}$/;
  const servicePattern = /^[a-z0-9][a-z0-9_-]{0,39}$/;
  return {
    waybillNumber: cleanText(body.waybill_number, {
      field: 'Waybill number', required: true, max: 100, pattern: identifierPattern,
    }),
    trackingNumber: cleanText(body.tracking_number, {
      field: 'Tracking number', required: true, max: 100, pattern: identifierPattern,
    }),
    serviceType: cleanText(body.service_type || process.env.JNT_DEFAULT_SERVICE || 'standard', {
      field: 'Service type', required: true, max: 40, pattern: servicePattern,
    }).toLowerCase(),
    notes: cleanText(body.notes, { field: 'Notes', max: 1000 }),
  };
};

export const assertManualWaybillEligible = (order) => {
  if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
  if (String(order.status || '').toLowerCase() === 'cancelled') {
    throw fail(409, 'Cancelled orders cannot have a waybill.', 'ORDER_CANCELLED');
  }
  if (String(order.shipping_method || '').toLowerCase() === 'pickup') {
    throw fail(409, 'Pickup orders do not require a waybill.', 'PICKUP_ORDER');
  }
  if (
    String(order.payment_method || '').toLowerCase() === 'cod'
    && !COD_WAYBILL_STATUSES.has(String(order.status || '').toLowerCase())
  ) {
    throw fail(409, 'Confirm or process the COD order before creating its waybill.', 'COD_ORDER_NOT_CONFIRMED');
  }
};

const isStaff = (user) => STAFF_ROLE_SET.has(user?.role);

const serializeShipment = (shipment, { staff = false } = {}) => {
  const serialized = {
    id: shipment.id,
    order_id: shipment.order_id,
    provider: shipment.provider || 'manual',
    shipping_provider: shipment.shipping_provider || 'internal',
    tracking_provider: shipment.tracking_provider || 'manual',
    courier: shipment.courier || 'jnt',
    courier_name: shipment.courier_name || 'J&T Express',
    service_type: shipment.service_type || 'standard',
    waybill_number: shipment.waybill_number,
    tracking_number: shipment.tracking_number,
    shipping_fee: Number(shipment.shipping_fee || 0),
    currency: shipment.currency || 'PHP',
    status: shipment.normalized_status || shipment.status,
    label_url: shipment.label_url || null,
    created_at: shipment.created_at,
    updated_at: shipment.updated_at,
  };
  if (staff) {
    serialized.created_by = shipment.created_by
      ? { id: shipment.created_by, name: shipment.created_by_name || null }
      : null;
    serialized.notes = shipment.metadata?.notes || null;
  }
  return serialized;
};

const loadShipmentEvents = async (db, shipmentId) => {
  const result = await db.query(
    `SELECT status, description, location,
            COALESCE(event_time, occurred_at, created_at) AS event_time,
            COALESCE(event_time, occurred_at, created_at) AS occurred_at,
            created_at
     FROM shipment_events
     WHERE shipment_id = $1
     ORDER BY COALESCE(event_time, occurred_at, created_at), id`,
    [shipmentId]
  );
  return result.rows;
};

const shipmentResponse = async (db, shipment, staff) => ({
  shipment: serializeShipment(shipment, { staff }),
  events: await loadShipmentEvents(db, shipment.id),
});

const loadShipmentForAccess = async ({ orderId = null, shipmentId = null, user }) => {
  const byOrder = orderId !== null;
  const lookup = byOrder ? orderId : shipmentId;
  const result = await pool.query(
    `SELECT s.*, o.user_id AS order_user_id, creator.name AS created_by_name
     FROM shipments s
     JOIN orders o ON o.id = s.order_id
     LEFT JOIN users creator ON creator.id = s.created_by
     WHERE ${byOrder ? 's.order_id' : 's.id'} = $1
       AND ($2::boolean OR o.user_id = $3)
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [lookup, isStaff(user), user.id]
  );
  return result.rows[0] || null;
};

const duplicateError = (error) => {
  if (error?.code !== '23505') return null;
  const target = `${error.constraint || ''} ${error.detail || ''}`.toLowerCase();
  if (target.includes('waybill')) return fail(409, 'Waybill number is already in use.', 'DUPLICATE_WAYBILL_NUMBER');
  if (target.includes('tracking')) return fail(409, 'Tracking number is already in use.', 'DUPLICATE_TRACKING_NUMBER');
  if (target.includes('active_order') || target.includes('order_id')) {
    return fail(409, 'This order already has an active shipment.', 'ACTIVE_SHIPMENT_EXISTS');
  }
  return fail(409, 'Shipment identifiers must be unique.', 'DUPLICATE_SHIPMENT_IDENTIFIER');
};

const sendError = (res, error, fallback) => {
  const safe = duplicateError(error) || error;
  const status = Number.isInteger(safe?.status) ? safe.status : 500;
  if (status >= 500) console.error(fallback, error.message);
  return res.status(status).json({
    message: status >= 500 ? fallback : safe.message,
    ...(safe?.code ? { code: safe.code } : {}),
  });
};

export const createManualWaybill = async (req, res) => {
  let client;
  try {
    const orderId = positiveId(req.params.orderId, 'order ID');
    const input = validateManualWaybillInput(req.body);
    client = await pool.connect();
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, user_id, status, payment_method, payment_status, shipping_method,
              shipping_fee, delivery_method
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );
    const order = orderResult.rows[0];
    assertManualWaybillEligible(order);

    const active = await client.query(
      `SELECT id FROM shipments
       WHERE order_id = $1 AND status NOT IN ('cancelled', 'returned')
       LIMIT 1`,
      [orderId]
    );
    if (active.rowCount) throw fail(409, 'This order already has an active shipment.', 'ACTIVE_SHIPMENT_EXISTS');

    const existingIdentifier = await client.query(
      `SELECT waybill_number, tracking_number
       FROM shipments
       WHERE waybill_number = $1 OR tracking_number = $2
       LIMIT 1`,
      [input.waybillNumber, input.trackingNumber]
    );
    if (existingIdentifier.rows[0]?.waybill_number === input.waybillNumber) {
      throw fail(409, 'Waybill number is already in use.', 'DUPLICATE_WAYBILL_NUMBER');
    }
    if (existingIdentifier.rows[0]?.tracking_number === input.trackingNumber) {
      throw fail(409, 'Tracking number is already in use.', 'DUPLICATE_TRACKING_NUMBER');
    }

    const inserted = await client.query(
      `INSERT INTO shipments (
         order_id, provider, shipping_provider, tracking_provider, courier, courier_name,
         service_type, waybill_number, tracking_number, shipping_fee, currency, status,
         normalized_status, provider_status, metadata, created_by, booked_at
       ) VALUES ($1,'manual','internal','manual','jnt',$2,$3,$4,$5,$6,'PHP',
                 'waybill_created','waybill_created','waybill_created',$7::jsonb,$8,NOW())
       RETURNING *`,
      [
        orderId,
        String(process.env.JNT_COURIER_NAME || 'J&T Express').trim(),
        input.serviceType,
        input.waybillNumber,
        input.trackingNumber,
        Number(order.shipping_fee || 0),
        JSON.stringify({ notes: input.notes }),
        req.user.id,
      ]
    );
    const shipment = inserted.rows[0];

    await client.query(
      `INSERT INTO shipment_events (
         shipment_id, provider, provider_event_id, status, description, raw_event,
         payload, event_time, occurred_at
       ) VALUES ($1,'manual',$2,'waybill_created',$3,$4::jsonb,$4::jsonb,NOW(),NOW())`,
      [
        shipment.id,
        `manual-waybill-created-${shipment.id}`,
        input.notes || 'J&T waybill created manually by the store.',
        JSON.stringify({ source: 'manual', notes: input.notes }),
      ]
    );

    await client.query(
      `UPDATE orders
       SET shipping_provider = 'internal', courier = 'jnt', courier_name = $2,
           shipping_status = 'waybill_created', delivery_method = $3,
           waybill_number = $4, waybill_status = 'generated', waybill_generated_at = NOW(),
           tracking_number = $5, updated_at = NOW()
       WHERE id = $1`,
      [orderId, shipment.courier_name, input.serviceType, input.waybillNumber, input.trackingNumber]
    );

    await writeAuditLog(client, {
      req,
      actorUserId: req.user.id,
      action: 'shipment.manual_waybill.create',
      entityType: 'shipment',
      entityId: shipment.id,
      afterData: {
        order_id: orderId,
        courier: 'jnt',
        status: 'waybill_created',
      },
      metadata: { provider: 'manual' },
    });
    await createOrderWorkflowNotification(client, {
      userId: order.user_id,
      orderId,
      type: 'shipment_update',
      status: 'waybill_created',
      title: 'J&T waybill created',
      message: 'Your J&T Express tracking number is now available.',
      extra: { shipment_id: shipment.id },
    });

    await client.query('COMMIT');
    return res.status(201).json(await shipmentResponse(pool, {
      ...shipment,
      created_by_name: req.user.name || null,
    }, true));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return sendError(res, error, 'Manual waybill could not be created.');
  } finally {
    client?.release();
  }
};

export const getShipmentByOrder = async (req, res) => {
  try {
    const orderId = positiveId(req.params.orderId, 'order ID');
    const shipment = await loadShipmentForAccess({ orderId, user: req.user });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found.' });
    return res.json(await shipmentResponse(pool, shipment, isStaff(req.user)));
  } catch (error) {
    return sendError(res, error, 'Shipment could not be loaded.');
  }
};

export const getShipmentById = async (req, res) => {
  try {
    const shipmentId = positiveId(req.params.shipmentId, 'shipment ID');
    const shipment = await loadShipmentForAccess({ shipmentId, user: req.user });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found.' });
    return res.json(await shipmentResponse(pool, shipment, isStaff(req.user)));
  } catch (error) {
    return sendError(res, error, 'Shipment could not be loaded.');
  }
};

export const updateManualShipmentStatus = async (req, res) => {
  let client;
  try {
    const shipmentId = positiveId(req.params.shipmentId, 'shipment ID');
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!MANUAL_SHIPMENT_STATUS_SET.has(status)) {
      throw fail(400, 'Shipment status is invalid.', 'INVALID_SHIPMENT_STATUS');
    }
    const description = cleanText(req.body?.description, { field: 'Description', max: 2000 });
    const location = cleanText(req.body?.location, { field: 'Location', max: 255 });
    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT s.*, o.user_id AS order_user_id
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1
       FOR UPDATE OF s, o`,
      [shipmentId]
    );
    const shipment = result.rows[0];
    if (!shipment) throw fail(404, 'Shipment not found.', 'SHIPMENT_NOT_FOUND');

    await client.query(
      `UPDATE shipments
       SET status = $2::text, normalized_status = $2::text, provider_status = $2::text,
           cancelled_at = CASE WHEN $2::text = 'cancelled' THEN NOW() ELSE cancelled_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [shipmentId, status]
    );
    await client.query(
      `INSERT INTO shipment_events (
         shipment_id, provider, provider_event_id, status, description, location,
         raw_event, payload, event_time, occurred_at
       ) VALUES ($1,'manual',$2,$3,$4,$5,$6::jsonb,$6::jsonb,NOW(),NOW())`,
      [
        shipmentId,
        `manual-status-${shipmentId}-${Date.now()}`,
        status,
        description || `Shipment status updated to ${status.replaceAll('_', ' ')}.`,
        location,
        JSON.stringify({ source: 'manual', changed_by: req.user.id }),
      ]
    );
    await client.query(
      `UPDATE orders
       SET shipping_status = $2::text, updated_at = NOW()
       WHERE id = $1`,
      [shipment.order_id, status]
    );
    await writeAuditLog(client, {
      req,
      actorUserId: req.user.id,
      action: 'shipment.manual_status.update',
      entityType: 'shipment',
      entityId: shipmentId,
      beforeData: { status: shipment.normalized_status || shipment.status },
      afterData: { status },
      metadata: { order_id: shipment.order_id, provider: 'manual' },
    });
    await createOrderWorkflowNotification(client, {
      userId: shipment.order_user_id,
      orderId: shipment.order_id,
      type: 'shipment_update',
      status,
      title: 'J&T shipment update',
      message: description || `Your shipment status is now ${status.replaceAll('_', ' ')}.`,
      extra: { shipment_id: shipmentId },
    });
    await client.query('COMMIT');

    const refreshed = await loadShipmentForAccess({ shipmentId, user: req.user });
    return res.json(await shipmentResponse(pool, refreshed, true));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return sendError(res, error, 'Shipment status could not be updated.');
  } finally {
    client?.release();
  }
};

export const __testing = {
  serializeShipment,
  duplicateError,
  isActiveShipmentStatus: (status) => !ACTIVE_SHIPMENT_STATUSES.has(status),
};
