import crypto from 'crypto';
import QRCode from 'qrcode';

const DEFAULT_WEIGHT_KG = 1;
const WAYBILL_STATUSES = new Set(['not_requested', 'pending', 'generated', 'failed']);

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

const parseJsonMaybe = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getConfig = () => {
  const mode = String(process.env.JNT_MODE || 'sandbox').trim().toLowerCase();
  const mockMode = String(process.env.JNT_MOCK_MODE || '').trim().toLowerCase() === 'true';
  const baseUrl = normalizeText(process.env.JNT_API_BASE_URL)
    || normalizeText(mode === 'production' ? process.env.JNT_PRODUCTION_URL : process.env.JNT_SANDBOX_URL)
    || normalizeText(process.env.JNT_API_URL);
  const trackingUrl = normalizeText(process.env.JNT_TRACKING_API_BASE_URL)
    || normalizeText(mode === 'production' ? process.env.JNT_PRODUCTION_TRACKING_URL : process.env.JNT_SANDBOX_TRACKING_URL)
    || normalizeText(process.env.JNT_TRACKING_URL);

  return {
    mode,
    mockMode,
    baseUrl,
    trackingUrl,
    username: normalizeText(process.env.JNT_USERNAME),
    apiKey: normalizeText(process.env.JNT_API_KEY),
    customerCode: normalizeText(process.env.JNT_CUSTOMER_CODE),
    signingKey: normalizeText(process.env.JNT_SECRET_KEY || process.env.JNT_SIGNING_KEY),
    webhookSecret: normalizeText(process.env.JNT_WEBHOOK_SECRET || process.env.COURIER_WEBHOOK_SECRET),
    sender: {
      name: normalizeText(process.env.JNT_SENDER_NAME || process.env.STORE_NAME) || '10th West Moto',
      contact: normalizeText(process.env.JNT_SENDER_CONTACT || process.env.JNT_SENDER_NAME || process.env.STORE_NAME) || '10th West Moto',
      phone: normalizeText(process.env.JNT_SENDER_PHONE),
      address: normalizeText(process.env.JNT_SENDER_ADDRESS),
      cityCode: normalizeText(process.env.JNT_ORIGIN_CODE),
      areaCode: normalizeText(process.env.JNT_ORIGIN_AREA_CODE),
      zip: normalizeText(process.env.JNT_SENDER_ZIP),
    },
    defaultWeightKg: Math.max(0.01, toFiniteNumber(process.env.JNT_DEFAULT_WEIGHT_KG, DEFAULT_WEIGHT_KG)),
    serviceType: Number.parseInt(process.env.JNT_SERVICE_TYPE || '1', 10),
    expressType: normalizeText(process.env.JNT_EXPRESS_TYPE) || '1',
  };
};

export const getJntConfigurationStatus = () => {
  const config = getConfig();
  const required = {
    JNT_API_BASE_URL: config.baseUrl,
    JNT_TRACKING_API_BASE_URL: config.trackingUrl,
    JNT_USERNAME: config.username,
    JNT_API_KEY: config.apiKey,
    JNT_CUSTOMER_CODE: config.customerCode,
    JNT_SECRET_KEY: config.signingKey,
    JNT_WEBHOOK_SECRET: config.webhookSecret,
    JNT_SENDER_PHONE: config.sender.phone,
    JNT_SENDER_ADDRESS: config.sender.address,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    configured: !config.mockMode && missing.length === 0,
    mock: config.mockMode,
    mode: config.mode,
    missing,
  };
};

export const ensureJntOrderColumns = async (db) => {
  // Schema is managed exclusively by Knex migrations.
  return;
  await db.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS courier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS waybill_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS waybill_status VARCHAR(30) NOT NULL DEFAULT 'not_requested',
      ADD COLUMN IF NOT EXISTS waybill_generated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS waybill_label_payload JSONB,
      ADD COLUMN IF NOT EXISTS courier_metadata JSONB;
  `);

  await db.query('CREATE INDEX IF NOT EXISTS idx_orders_waybill_number ON orders(waybill_number)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_orders_courier_status ON orders(courier, waybill_status)');
};

const buildGoodsDescription = (items = []) => {
  const names = items.map((item) => normalizeText(item.product_name)).filter(Boolean);
  if (names.length === 0) return 'Motorcycle parts';
  return names.join(', ').replace(/[^a-zA-Z0-9 ,.-]/g, '').slice(0, 40) || 'Motorcycle parts';
};

const resolveWeightKg = (items = [], config) => {
  const total = items.reduce((sum, item) => {
    const itemWeight = toFiniteNumber(item.shipping_weight_kg, 0);
    return sum + (itemWeight > 0 ? itemWeight : config.defaultWeightKg) * Math.max(1, toFiniteNumber(item.quantity, 1));
  }, 0);
  return Math.max(0.01, Math.round(total * 100) / 100);
};

const buildShipmentPayload = ({ order, items, config }) => {
  const snapshot = parseJsonMaybe(order.shipping_address_snapshot, {});
  const recipientName = normalizeText(snapshot.recipient_name || order.customer_name || order.guest_name) || 'Customer';
  const receiverPhone = normalizeText(snapshot.phone) || '';
  const receiverAddress = normalizeText(snapshot.address_string)
    || [snapshot.street, snapshot.barangay, snapshot.city, snapshot.state, snapshot.postal_code, 'Philippines'].filter(Boolean).join(', ');
  const quantity = items.reduce((sum, item) => sum + Math.max(1, Number.parseInt(String(item.quantity || 1), 10)), 0);
  const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
  const orderId = `TWM-${String(order.id).padStart(8, '0')}`;

  return {
    username: config.username,
    api_key: config.apiKey,
    orderid: orderId,
    shipper_name: config.sender.name,
    shipper_contact: config.sender.contact,
    shipper_phone: config.sender.phone,
    shipper_addr: config.sender.address,
    origin_code: config.sender.cityCode,
    receiver_name: recipientName.slice(0, 30),
    receiver_phone: receiverPhone.slice(0, 15),
    receiver_addr: receiverAddress.slice(0, 200),
    receiver_zip: String(snapshot.postal_code || '0000').padStart(4, '0').slice(0, 4),
    destination_code: normalizeText(snapshot.city_code) || '',
    receiver_area: normalizeText(snapshot.barangay_code) || '',
    qty: Math.max(1, quantity),
    weight: resolveWeightKg(items, config),
    goodsdesc: buildGoodsDescription(items),
    servicetype: config.serviceType,
    insurance: '',
    orderdate: new Date().toISOString().slice(0, 19).replace('T', ' '),
    item_name: buildGoodsDescription(items).slice(0, 50),
    cod: isCod ? Math.round(roundMoney(order.total_amount)) : 0,
    sendstarttime: '',
    sendendtime: '',
    expresstype: config.expressType,
    goodsvalue: Math.round(roundMoney(order.total_amount)),
    customer_code: config.customerCode || '',
  };
};

const signPayload = (dataParam, signingKey) => {
  const md5Hex = crypto.createHash('md5').update(`${dataParam}${signingKey}`, 'utf8').digest('hex');
  return Buffer.from(md5Hex).toString('base64');
};

const extractWaybillNumber = (responseBody) => {
  const candidates = [
    responseBody?.awb,
    responseBody?.waybill,
    responseBody?.waybill_number,
    responseBody?.billcode,
    responseBody?.data?.awb,
    responseBody?.data?.waybill,
    responseBody?.data?.billcode,
    Array.isArray(responseBody?.detail) ? responseBody.detail[0]?.awb : null,
    Array.isArray(responseBody?.detail) ? responseBody.detail[0]?.billcode : null,
    Array.isArray(responseBody?.data) ? responseBody.data[0]?.awb : null,
    Array.isArray(responseBody?.data) ? responseBody.data[0]?.billcode : null,
  ].map(normalizeText);

  return candidates.find(Boolean) || null;
};

const requestJntWaybill = async (payload, config) => {
  if (config.mockMode) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('J&T mock mode cannot be used in production.');
      error.code = 'JNT_MOCK_DISABLED_IN_PRODUCTION';
      throw error;
    }
    return {
      response: {
        is_success: 'true',
        awb: `JNT${Date.now()}${String(payload.orderid).slice(-4)}`,
        orderid: payload.orderid,
        mock: true,
      },
      request: payload,
    };
  }

  if (!config.baseUrl || !config.username || !config.apiKey || !config.customerCode || !config.signingKey) {
    const error = new Error('J&T API is not configured.');
    error.code = 'JNT_NOT_CONFIGURED';
    error.missing = getJntConfigurationStatus().missing;
    throw error;
  }

  const dataParam = JSON.stringify({ detail: [payload] });
  const form = new URLSearchParams();
  form.set('data_param', dataParam);
  form.set('data_sign', signPayload(dataParam, config.signingKey));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: controller.signal,
    });
    const text = await res.text();
    let responseBody = {};
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { raw: text };
    }

    if (!res.ok) {
      const error = new Error(responseBody?.error_message || `J&T API failed with ${res.status}`);
      error.code = 'JNT_API_ERROR';
      error.responseBody = responseBody;
      throw error;
    }

    return { response: responseBody, request: payload };
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeTrackingStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (['delivered', 'signed'].includes(normalized)) return 'delivered';
  if (['out_for_delivery', 'delivery'].includes(normalized)) return 'out_for_delivery';
  if (['picked_up', 'pickup', 'collected'].includes(normalized)) return 'picked_up';
  if (['return', 'returned', 'returning'].includes(normalized)) return 'returned';
  if (['failed', 'exception', 'delivery_failed'].includes(normalized)) return 'failed';
  return 'in_transit';
};

const TRACKING_TO_ORDER = {
  picked_up: 'shipped',
  in_transit: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  failed: 'failed',
  returned: 'returned',
};

const extractTrackingEvents = (body, waybillNumber) => {
  const candidates = Array.isArray(body?.data) ? body.data
    : Array.isArray(body?.detail) ? body.detail
      : Array.isArray(body?.events) ? body.events
        : Array.isArray(body?.data?.events) ? body.data.events
          : [];

  return candidates.map((event, index) => {
    const rawStatus = event.status || event.scanType || event.scan_type || event.type || event.state;
    const status = normalizeTrackingStatus(rawStatus);
    const occurredAt = new Date(event.time || event.scanTime || event.scan_time || event.created_at || Date.now());
    return {
      provider_event_id: normalizeText(event.id || event.event_id || event.scanId || `${waybillNumber}-${status}-${occurredAt.getTime()}-${index}`),
      status,
      location: normalizeText(event.location || event.scanSite || event.scan_site || event.city),
      description: normalizeText(event.description || event.desc || event.remark || rawStatus) || status,
      occurred_at: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      payload: event,
    };
  }).filter((event) => event.provider_event_id);
};

const requestJntTracking = async (waybillNumber, config) => {
  if (config.mockMode) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('J&T mock tracking cannot be used in production.');
      error.code = 'JNT_MOCK_DISABLED_IN_PRODUCTION';
      throw error;
    }
    return {
      response: { mock: true, waybill_number: waybillNumber },
      events: [{
        provider_event_id: `mock-${waybillNumber}-${Date.now()}`,
        status: 'in_transit',
        location: 'Mock sorting hub',
        description: 'Development mock tracking update',
        occurred_at: new Date(),
        payload: { mock: true },
      }],
    };
  }

  if (!config.trackingUrl || !config.username || !config.apiKey || !config.customerCode || !config.signingKey) {
    const error = new Error('J&T tracking API is not configured.');
    error.code = 'JNT_TRACKING_NOT_CONFIGURED';
    error.missing = getJntConfigurationStatus().missing;
    throw error;
  }

  const dataParam = JSON.stringify({ detail: [{ billcode: waybillNumber, customer_code: config.customerCode || '' }] });
  const form = new URLSearchParams();
  form.set('data_param', dataParam);
  form.set('data_sign', signPayload(dataParam, config.signingKey));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(config.trackingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: controller.signal,
    });
    const text = await res.text();
    let responseBody = {};
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { raw: text };
    }
    if (!res.ok) {
      const error = new Error(responseBody?.error_message || `J&T tracking API failed with ${res.status}`);
      error.code = 'JNT_TRACKING_API_ERROR';
      error.responseBody = responseBody;
      throw error;
    }
    return { response: responseBody, events: extractTrackingEvents(responseBody, waybillNumber) };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildLabelPayload = async ({ order, items, waybillNumber, requestPayload }) => {
  const qrDataUrl = await QRCode.toDataURL(waybillNumber, { margin: 1, width: 180 });
  const snapshot = parseJsonMaybe(order.shipping_address_snapshot, {});
  return {
    courier: 'jnt',
    waybill_number: waybillNumber,
    barcode_value: waybillNumber,
    qr_data_url: qrDataUrl,
    order_id: order.id,
    order_number: order.order_number || order.id,
    recipient: {
      name: snapshot.recipient_name || order.customer_name || order.guest_name || 'Customer',
      phone: snapshot.phone || '',
      address: snapshot.address_string || order.shipping_address || '',
    },
    sender: {
      name: requestPayload.shipper_name,
      phone: requestPayload.shipper_phone,
      address: requestPayload.shipper_addr,
    },
    package: {
      qty: requestPayload.qty,
      weight_kg: requestPayload.weight,
      goods: requestPayload.goodsdesc,
      item_count: items.length,
    },
    generated_at: new Date().toISOString(),
  };
};

const getOrderForShipment = async (db, orderId) => {
  const orderResult = await db.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) return null;

  const itemsResult = await db.query(
    `SELECT oi.*, p.shipping_weight_kg
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return { order: orderResult.rows[0], items: itemsResult.rows };
};

export const createJntWaybillForOrder = async (db, orderId, { generatedBy = null } = {}) => {
  await ensureJntOrderColumns(db);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lockedResult = await client.query(
      `SELECT id, status, source, shipping_method, waybill_number, waybill_status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (lockedResult.rows.length === 0) {
      await client.query('ROLLBACK');
      const error = new Error('Order not found');
      error.status = 404;
      throw error;
    }

    const locked = lockedResult.rows[0];
    if (locked.waybill_number) {
      await client.query('COMMIT');
      return getJntWaybill(db, orderId);
    }

    if (locked.waybill_status === 'pending') {
      await client.query('ROLLBACK');
      const error = new Error('A courier booking is already in progress for this order.');
      error.status = 409;
      throw error;
    }

    if (!['paid', 'processing', 'packed', 'ready_for_pickup'].includes(String(locked.status || '').toLowerCase())) {
      await client.query('ROLLBACK');
      const error = new Error('J&T waybill can only be generated for paid, processing, packed, or ready-for-pickup orders.');
      error.status = 400;
      throw error;
    }

    if (String(locked.source || '').toLowerCase() === 'pos' || String(locked.shipping_method || '').toLowerCase() === 'pickup') {
      await client.query('ROLLBACK');
      const error = new Error('J&T waybill is not required for POS or pickup orders.');
      error.status = 400;
      throw error;
    }

    await client.query(
      `UPDATE orders
       SET courier = 'jnt',
           waybill_status = 'pending',
           courier_metadata = COALESCE(courier_metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, JSON.stringify({ generated_by: generatedBy, requested_at: new Date().toISOString() })]
    );
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }

  const shipment = await getOrderForShipment(db, orderId);
  if (!shipment) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }

  const config = getConfig();
  const requestPayload = buildShipmentPayload({ ...shipment, config });

  try {
    const apiResult = await requestJntWaybill(requestPayload, config);
    const waybillNumber = extractWaybillNumber(apiResult.response);
    if (!waybillNumber) {
      const error = new Error('J&T API did not return a waybill number.');
      error.code = 'JNT_MISSING_WAYBILL';
      error.responseBody = apiResult.response;
      throw error;
    }

    const labelPayload = await buildLabelPayload({
      ...shipment,
      waybillNumber,
      requestPayload,
    });

    const updateResult = await db.query(
      `UPDATE orders
       SET courier = 'jnt',
           waybill_number = $2,
           tracking_number = $2,
           waybill_status = 'generated',
           waybill_generated_at = CURRENT_TIMESTAMP,
           waybill_label_payload = $3::jsonb,
           courier_metadata = COALESCE(courier_metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND waybill_number IS NULL
       RETURNING *`,
      [
        orderId,
        waybillNumber,
        JSON.stringify(labelPayload),
        JSON.stringify({
          jnt_mode: config.mode,
          provider_reference: waybillNumber,
          generated_by: generatedBy,
        }),
      ]
    );

    if (updateResult.rows.length === 0) return getJntWaybill(db, orderId);
    const generatedOrder = updateResult.rows[0];
    const shipmentResult = await db.query(
      `INSERT INTO shipments (
         order_id, provider, status, provider_shipment_id, tracking_number, shipping_fee, booking_idempotency_key, booked_at
       ) VALUES ($1, 'jnt', 'booked', $2, $2, $3, $4, NOW())
       ON CONFLICT (order_id) DO UPDATE SET
         status = 'booked',
         provider_shipment_id = EXCLUDED.provider_shipment_id,
         tracking_number = EXCLUDED.tracking_number,
         booked_at = COALESCE(shipments.booked_at, NOW()),
         updated_at = NOW()
       RETURNING *`,
      [orderId, waybillNumber, roundMoney(generatedOrder.shipping_fee || 0), `jnt-waybill:${orderId}`]
    );
    await db.query(
      `INSERT INTO waybills (order_id, shipment_id, waybill_number, label_payload, generated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (order_id) DO UPDATE SET
         shipment_id = EXCLUDED.shipment_id,
         waybill_number = EXCLUDED.waybill_number,
         label_payload = EXCLUDED.label_payload,
         updated_at = NOW()`,
      [orderId, shipmentResult.rows[0]?.id || null, waybillNumber, JSON.stringify(labelPayload), generatedBy]
    );
    return generatedOrder;
  } catch (error) {
    await db.query(
      `UPDATE orders
       SET courier = 'jnt',
           waybill_status = 'failed',
           courier_metadata = COALESCE(courier_metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND waybill_number IS NULL`,
      [
        orderId,
        JSON.stringify({
          error: error.message,
          code: error.code || null,
          failed_at: new Date().toISOString(),
        }),
      ]
    );
    throw error;
  }
};

export const getJntWaybill = async (db, orderId) => {
  await ensureJntOrderColumns(db);
  const result = await db.query(
    `SELECT id, courier, waybill_number, tracking_number, waybill_status,
            waybill_generated_at, waybill_label_payload, courier_metadata
     FROM orders
     WHERE id = $1`,
    [orderId]
  );
  return result.rows[0] || null;
};

export const refreshJntTrackingForOrder = async (db, orderId, { requestedBy = null } = {}) => {
  const waybill = await getJntWaybill(db, orderId);
  if (!waybill) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }
  if (!waybill.waybill_number) {
    const error = new Error('No J&T waybill exists for this order.');
    error.status = 400;
    throw error;
  }

  const config = getConfig();
  const tracking = await requestJntTracking(waybill.waybill_number, config);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const shipmentResult = await client.query(
      `SELECT * FROM shipments WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) {
      const error = new Error('Shipment record not found for this waybill.');
      error.status = 409;
      throw error;
    }

    let latestStatus = shipment.status;
    const savedEvents = [];
    for (const event of tracking.events) {
      const inserted = await client.query(
        `INSERT INTO shipment_events (shipment_id, provider_event_id, status, location, description, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (shipment_id, provider_event_id) DO NOTHING
         RETURNING status, location, description, occurred_at`,
        [shipment.id, event.provider_event_id, event.status, event.location, event.description, JSON.stringify(event.payload), event.occurred_at]
      );
      if (inserted.rows[0]) {
        latestStatus = event.status;
        savedEvents.push(inserted.rows[0]);
      }
    }

    await client.query(
      `UPDATE shipments
       SET status = $2,
           provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [shipment.id, latestStatus, JSON.stringify({ last_tracking_refresh_at: new Date().toISOString(), requested_by: requestedBy })]
    );

    const orderResult = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const nextOrderStatus = TRACKING_TO_ORDER[latestStatus] || orderResult.rows[0]?.status;
    if (nextOrderStatus && orderResult.rows[0]?.status !== nextOrderStatus) {
      await client.query(
        `UPDATE orders SET status = $2, delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END, updated_at = NOW() WHERE id = $1`,
        [orderId, nextOrderStatus]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, source, changed_by, note, metadata)
         VALUES ($1, $2, $3, 'courier', $4, 'J&T tracking refresh', $5::jsonb)`,
        [orderId, orderResult.rows[0]?.status, nextOrderStatus, requestedBy, JSON.stringify({ waybill_number: waybill.waybill_number })]
      );
    }

    await client.query('COMMIT');
    return {
      tracking_number: waybill.tracking_number || waybill.waybill_number,
      waybill_number: waybill.waybill_number,
      status: latestStatus,
      order_status: nextOrderStatus,
      events_saved: savedEvents.length,
      provider_response: tracking.response,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const normalizeWaybillStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return WAYBILL_STATUSES.has(normalized) ? normalized : 'not_requested';
};
