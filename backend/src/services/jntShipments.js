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
  const baseUrl = normalizeText(mode === 'production' ? process.env.JNT_PRODUCTION_URL : process.env.JNT_SANDBOX_URL)
    || normalizeText(process.env.JNT_API_URL);

  return {
    mode,
    mockMode,
    baseUrl,
    username: normalizeText(process.env.JNT_USERNAME),
    apiKey: normalizeText(process.env.JNT_API_KEY),
    customerCode: normalizeText(process.env.JNT_CUSTOMER_CODE),
    signingKey: normalizeText(process.env.JNT_SIGNING_KEY),
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

export const ensureJntOrderColumns = async (db) => {
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

  if (!config.baseUrl || !config.username || !config.apiKey || !config.signingKey) {
    const error = new Error('J&T API is not configured.');
    error.code = 'JNT_NOT_CONFIGURED';
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

    if (!['paid', 'preparing'].includes(String(locked.status || '').toLowerCase())) {
      await client.query('ROLLBACK');
      const error = new Error('J&T waybill can only be generated for paid or preparing orders.');
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
          request: apiResult.request,
          response: apiResult.response,
          generated_by: generatedBy,
        }),
      ]
    );

    if (updateResult.rows.length === 0) return getJntWaybill(db, orderId);
    return updateResult.rows[0];
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
          response: error.responseBody || null,
          failed_at: new Date().toISOString(),
          request: requestPayload,
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

export const normalizeWaybillStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return WAYBILL_STATUSES.has(normalized) ? normalized : 'not_requested';
};
