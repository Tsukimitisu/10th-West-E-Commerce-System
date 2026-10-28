import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/payment_auth_test';

const { default: pool } = await import('../config/database.js');
const { default: router } = await import('./payments.js');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('payment status authenticates, authorizes staff, then validates the order ID', async () => {
  const query = mock.method(pool, 'query', async (sql) => String(sql).includes('FROM orders o JOIN payments p')
    ? { rowCount: 1, rows: [{ order_id: 1, payment_status: 'pending' }] }
    : String(sql).includes('INSERT INTO request_rate_limits') ? { rows: [{ request_count: 1, retry_after_seconds: 60 }] } : { rows: [{ has_permission: false }] });
  try {
    for (const path of ['/:orderId/status', '/orders/:orderId/status']) {
      const route = router.stack.find((layer) => layer.route?.path === path)?.route;
      assert.ok(route, `${path} is registered`);
      const [authenticate, authorize, throttle, status] = route.stack.map((layer) => layer.handle);

      const guest = response();
      await authenticate({ headers: {} }, guest, () => assert.fail('guest reached authorization'));
      assert.equal(guest.statusCode, 401);

      const staff = response();
      await authorize({ user: { id: 9, role: 'store_staff' }, params: { orderId: '0' } }, staff,
        () => assert.fail('staff without payments.view reached ID validation'));
      assert.equal(staff.statusCode, 403);
      assert.equal(staff.body.code, 'PERMISSION_DENIED');

      const owner = response();
      let authorized = false;
      authorize({ user: { id: 1, role: 'owner' } }, owner, () => { authorized = true; });
      assert.equal(authorized, true);
      await status({ user: { id: 1, role: 'owner' }, params: { orderId: '0' } }, owner);
      assert.equal(owner.statusCode, 400);
      const valid = response();
      let permitted = false; await throttle({ user: { id: 1, role: 'owner' } }, valid, () => { permitted = true; }); assert.equal(permitted, true);
      await status({ user: { id: 1, role: 'owner' }, params: { orderId: '1' } }, valid);
      assert.equal(valid.statusCode, 200);
      assert.equal(valid.body.order_id, 1);
    }
    assert.equal(query.mock.callCount(), 6);
  } finally {
    mock.restoreAll();
    await pool.end();
  }
});
