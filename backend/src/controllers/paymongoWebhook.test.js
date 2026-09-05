import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, afterEach, before, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE = 'postgres';
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test_webhook_verification';

const { default: pool } = await import('../config/database.js');
const { handlePaymongoWebhook, __testing } = await import('./secureCheckoutController.js');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const checkoutPaidPayload = (eventId = 'evt_checkout_paid_1') => ({
  data: {
    id: eventId,
    attributes: {
      type: 'checkout_session.payment.paid',
      data: {
        id: 'cs_test_checkout_1',
        type: 'checkout_session',
        attributes: {
          metadata: { order_id: '501', payment_id: '701', user_id: '41', source: '10th-west-moto' },
          payments: [{ id: 'pay_test_1', type: 'payment', attributes: { amount: 125050, currency: 'PHP', status: 'paid' } }],
        },
      },
    },
  },
});

const paymentFailedPayload = () => ({
  data: {
    id: 'evt_payment_failed_1',
    attributes: {
      type: 'payment.failed',
      data: {
        id: 'pay_test_failed_1',
        type: 'payment',
        attributes: {
          status: 'failed',
          metadata: { order_id: '502', payment_id: '702', source: '10th-west-moto' },
        },
      },
    },
  },
});

const signedRequest = (payload) => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto
    .createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return {
    body: payload,
    rawBody,
    get(name) { return String(name).toLowerCase() === 'paymongo-signature' ? `t=${timestamp},te=${digest}` : undefined; },
  };
};

const createWebhookDatabase = ({ paymentId = 701, orderId = 501, failed = false } = {}) => {
  const state = {
    paymentStatus: 'pending',
    orderStatus: 'payment_pending',
    orderPaymentStatus: 'pending',
    reservationStatus: 'active',
    stockDeductions: 0,
    historyWrites: 0,
    notificationWrites: 0,
    eventIds: new Set(),
  };
  const payment = () => ({
    id: paymentId,
    order_id: orderId,
    user_id: 41,
    order_user_id: 41,
    provider: 'paymongo',
    method: 'gcash',
    status: state.paymentStatus,
    amount: '1250.50',
    currency: 'PHP',
    external_checkout_id: failed ? 'cs_test_failed_1' : 'cs_test_checkout_1',
    external_payment_id: failed ? 'pay_test_failed_1' : null,
    order_status: state.orderStatus,
    order_payment_status: state.orderPaymentStatus,
  });
  const client = {
    async query(sql, params = []) {
      const source = String(sql);
      if (source.includes('INSERT INTO payment_events')) {
        if (state.eventIds.has(params[0])) return { rows: [], rowCount: 0 };
        state.eventIds.add(params[0]);
        return { rows: [{ id: state.eventIds.size }], rowCount: 1 };
      }
      if (source.includes('FROM payments p') && source.includes('JOIN orders o')) {
        return { rows: [payment()], rowCount: 1 };
      }
      if (source.includes("FROM stock_reservations WHERE order_id") && source.includes("status = 'active'")) {
        return state.reservationStatus === 'active'
          ? { rows: [{ product_id: 11, variant_id: null, quantity: 2 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (source.includes('UPDATE products SET stock_quantity = stock_quantity -')) {
        state.stockDeductions += 1;
        return { rows: [{ stock_before: 8, stock_after: 6 }], rowCount: 1 };
      }
      if (source.includes("UPDATE stock_reservations SET status = 'committed'")) state.reservationStatus = 'committed';
      if (source.includes("UPDATE stock_reservations SET status = 'released'")) state.reservationStatus = 'released';
      if (source.includes('SELECT status FROM orders')) return { rows: [{ status: state.orderStatus }], rowCount: 1 };
      if (source.includes("UPDATE orders SET status = 'paid'")) {
        state.orderStatus = 'paid';
        state.orderPaymentStatus = 'paid';
      }
      if (source.includes("UPDATE payments SET status = 'paid'")) state.paymentStatus = 'paid';
      if (source.includes("UPDATE orders SET status = $2, payment_status = $2")) {
        state.orderStatus = params[1];
        state.orderPaymentStatus = params[1];
      }
      if (source.includes('UPDATE payments SET status = $2')) state.paymentStatus = params[1];
      if (source.includes('INSERT INTO order_status_history')) state.historyWrites += 1;
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { client, state };
};

before(() => {
  mock.method(console, 'info', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  mock.restoreAll();
  mock.method(console, 'info', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
after(async () => pool.end().catch(() => {}));

test('checkout_session.payment.paid extracts checkout, payment, and metadata identifiers', () => {
  const event = __testing.extractPaymongoEvent(checkoutPaidPayload());
  assert.equal(event.eventType, 'checkout_session.payment.paid');
  assert.equal(event.checkoutId, 'cs_test_checkout_1');
  assert.equal(event.externalPaymentId, 'pay_test_1');
  assert.equal(event.paymentId, 701);
  assert.equal(event.orderId, 501);
  assert.equal(event.amount, 125050);
  assert.equal(event.currency, 'PHP');
});

test('checkout paid parser accepts JSON:API data envelopes used by provider deliveries', () => {
  const payload = checkoutPaidPayload('evt_enveloped');
  const originalResource = payload.data.attributes.data;
  originalResource.attributes.payments = [{ data: originalResource.attributes.payments[0] }];
  payload.data.attributes.data = { data: originalResource };
  const event = __testing.extractPaymongoEvent(payload);
  assert.equal(event.checkoutId, 'cs_test_checkout_1');
  assert.equal(event.externalPaymentId, 'pay_test_1');
  assert.equal(event.orderId, 501);
  assert.equal(event.paymentId, 701);
  assert.equal(event.amount, 125050);
});

test('paid webhook marks payment and order paid and deducts reserved stock exactly once', async () => {
  const { client, state } = createWebhookDatabase();
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async (sql) => {
    if (String(sql).includes('INSERT INTO notifications')) state.notificationWrites += 1;
    return { rows: [], rowCount: 1 };
  });

  const payload = checkoutPaidPayload();
  const first = makeResponse();
  await handlePaymongoWebhook(signedRequest(payload), first);
  assert.equal(first.statusCode, 200);
  assert.equal(state.paymentStatus, 'paid');
  assert.equal(state.orderStatus, 'paid');
  assert.equal(state.stockDeductions, 1);
  assert.equal(state.historyWrites, 1);

  const duplicate = makeResponse();
  await handlePaymongoWebhook(signedRequest(payload), duplicate);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.message, 'Event already processed.');
  assert.equal(state.stockDeductions, 1);
  assert.equal(state.historyWrites, 1);
});

test('payment.failed does not require paid amount fields and never marks the order paid', async () => {
  const { client, state } = createWebhookDatabase({ paymentId: 702, orderId: 502, failed: true });
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));

  const res = makeResponse();
  await handlePaymongoWebhook(signedRequest(paymentFailedPayload()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.paymentStatus, 'failed');
  assert.equal(state.orderStatus, 'failed');
  assert.equal(state.stockDeductions, 0);
});

test('webhook payment lookup falls back to checkout session then metadata order id', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (calls.length < 2) return { rows: [], rowCount: 0 };
      return { rows: [{ id: 88, provider: 'paymongo' }], rowCount: 1 };
    },
  };
  const result = await __testing.findPaymongoWebhookPayment(client, {
    paymentId: 77,
    checkoutId: 'cs_fallback',
    externalPaymentId: null,
    orderId: 99,
  });
  assert.equal(result.lookup, 'checkout_session_id');
  assert.equal(result.payment.id, 88);
  assert.match(calls[0].sql, /p\.id = \$1/);
  assert.match(calls[1].sql, /p\.external_checkout_id = \$1/);
});
