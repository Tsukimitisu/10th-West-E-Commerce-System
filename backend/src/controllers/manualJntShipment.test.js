import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../config/database.js';
import {
  createManualWaybill,
  getShipmentByOrder,
  updateManualShipmentStatus,
  __testing,
} from './shipmentController.js';

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const result = (rows = []) => ({ rows, rowCount: rows.length });

const withPool = async ({ clientQuery, poolQuery }, callback) => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const client = {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      return clientQuery(sql, params, this.queries);
    },
    release() {},
  };
  pool.connect = async () => client;
  pool.query = async (sql, params = []) => poolQuery(sql, params);
  try {
    return await callback(client);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
};

const shipment = {
  id: 44,
  order_id: 12,
  provider: 'manual',
  shipping_provider: 'internal',
  tracking_provider: 'manual',
  courier: 'jnt',
  courier_name: 'J&T Express',
  service_type: 'standard',
  waybill_number: 'JTWAYB1',
  tracking_number: 'JTTRACK1',
  shipping_fee: '100.00',
  currency: 'PHP',
  status: 'waybill_created',
  normalized_status: 'waybill_created',
  metadata: { notes: 'Booked manually through J&T' },
  created_by: 2,
  created_at: '2026-08-20T08:00:00.000Z',
  updated_at: '2026-08-20T08:00:00.000Z',
};

const waybillRequest = () => ({
  params: { orderId: '12' },
  body: {
    waybill_number: 'JTWAYB1',
    tracking_number: 'JTTRACK1',
    service_type: 'standard',
    notes: 'Booked manually through J&T',
  },
  user: { id: 2, name: 'Admin', role: 'admin' },
  ip: '127.0.0.1',
  get: () => 'unit-test',
});

const creationClient = ({ active = false, duplicate = null } = {}) => async (sql) => {
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return result();
  if (sql.includes('SELECT id, user_id, status')) {
    return result([{ id: 12, user_id: 7, status: 'processing', payment_method: 'cod', shipping_method: 'standard', shipping_fee: '100.00' }]);
  }
  if (sql.includes('SELECT id FROM shipments')) return result(active ? [{ id: 99 }] : []);
  if (sql.includes('SELECT waybill_number, tracking_number')) return result(duplicate ? [duplicate] : []);
  if (sql.includes('INSERT INTO shipments')) return result([shipment]);
  if (sql.includes('INSERT INTO notifications')) return result([{ id: 77, user_id: 7 }]);
  return result();
};

const eventsQuery = async (sql) => {
  if (sql.includes('FROM shipment_events')) {
    return result([{ status: 'waybill_created', description: 'Created', event_time: shipment.created_at }]);
  }
  throw new Error(`Unexpected pool query: ${sql}`);
};

test('manual J&T waybill creation saves shipment, event, order fields, audit, and notification', async () => {
  await withPool({ clientQuery: creationClient(), poolQuery: eventsQuery }, async (client) => {
    const res = makeResponse();
    await createManualWaybill(waybillRequest(), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.shipment.waybill_number, 'JTWAYB1');
    assert.equal(res.body.shipment.tracking_number, 'JTTRACK1');
    assert.equal(res.body.events[0].status, 'waybill_created');
    const sql = client.queries.map((entry) => entry.sql).join('\n');
    assert.match(sql, /INSERT INTO shipments/);
    assert.match(sql, /INSERT INTO shipment_events/);
    assert.match(sql, /shipping_status = 'waybill_created'/);
    assert.match(sql, /INSERT INTO audit_logs/);
    assert.match(sql, /INSERT INTO notifications/);
  });
});

test('duplicate waybill, tracking number, and active shipment are rejected clearly', async () => {
  for (const scenario of [
    { duplicate: { waybill_number: 'JTWAYB1', tracking_number: 'OTHER01' }, code: 'DUPLICATE_WAYBILL_NUMBER' },
    { duplicate: { waybill_number: 'OTHER01', tracking_number: 'JTTRACK1' }, code: 'DUPLICATE_TRACKING_NUMBER' },
    { active: true, code: 'ACTIVE_SHIPMENT_EXISTS' },
  ]) {
    await withPool({ clientQuery: creationClient(scenario), poolQuery: eventsQuery }, async () => {
      const res = makeResponse();
      await createManualWaybill(waybillRequest(), res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, scenario.code);
    });
  }
});

test('customer can view only an owned shipment and never receives admin metadata', async () => {
  const poolQuery = async (sql, params) => {
    if (sql.includes('FROM shipments s')) {
      assert.equal(params[1], false);
      return result(params[2] === 7 ? [{ ...shipment, order_user_id: 7, created_by_name: 'Admin' }] : []);
    }
    if (sql.includes('FROM shipment_events')) return result([{ status: 'waybill_created', event_time: shipment.created_at }]);
    throw new Error(`Unexpected query: ${sql}`);
  };
  await withPool({ clientQuery: async () => result(), poolQuery }, async () => {
    const own = makeResponse();
    await getShipmentByOrder({ params: { orderId: '12' }, user: { id: 7, role: 'customer' } }, own);
    assert.equal(own.statusCode, 200);
    assert.equal(own.body.shipment.tracking_number, 'JTTRACK1');
    assert.equal('notes' in own.body.shipment, false);
    assert.equal('created_by' in own.body.shipment, false);
    assert.equal('metadata' in own.body.shipment, false);

    const other = makeResponse();
    await getShipmentByOrder({ params: { orderId: '12' }, user: { id: 8, role: 'customer' } }, other);
    assert.equal(other.statusCode, 404);
  });
});

test('shipment status update creates an event and delivered updates order shipping_status', async () => {
  const updatedShipment = { ...shipment, status: 'delivered', normalized_status: 'delivered' };
  const clientQuery = async (sql) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return result();
    if (sql.includes('SELECT s.*, o.user_id')) return result([{ ...shipment, order_user_id: 7 }]);
    if (sql.includes('INSERT INTO notifications')) return result([{ id: 78, user_id: 7 }]);
    return result();
  };
  const poolQuery = async (sql) => {
    if (sql.includes('FROM shipments s')) return result([{ ...updatedShipment, order_user_id: 7, created_by_name: 'Admin' }]);
    if (sql.includes('FROM shipment_events')) return result([{ status: 'delivered', event_time: shipment.created_at }]);
    throw new Error(`Unexpected query: ${sql}`);
  };

  await withPool({ clientQuery, poolQuery }, async (client) => {
    const res = makeResponse();
    await updateManualShipmentStatus({
      params: { shipmentId: '44' },
      body: { status: 'delivered', description: 'Delivered to customer' },
      user: { id: 2, name: 'Admin', role: 'admin' },
      ip: '127.0.0.1',
      get: () => 'unit-test',
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.shipment.status, 'delivered');
    assert.ok(client.queries.some((entry) => (
      entry.sql.includes('SET status = $2::text')
      && entry.sql.includes("CASE WHEN $2::text = 'cancelled'")
    )));
    assert.ok(client.queries.some((entry) => entry.sql.includes('INSERT INTO shipment_events')));
    assert.ok(client.queries.some((entry) => (
      entry.sql.includes('SET shipping_status = $2::text') && entry.params[1] === 'delivered'
    )));
  });
});

test('database uniqueness violations are returned as safe validation errors', () => {
  const mapped = __testing.duplicateError({ code: '23505', constraint: 'idx_shipments_tracking_number' });
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'DUPLICATE_TRACKING_NUMBER');
  assert.doesNotMatch(mapped.message, /idx_shipments/i);
});
