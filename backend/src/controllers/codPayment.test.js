import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/cod_test';
const { default: pool } = await import('../config/database.js');
const { mapOrderRecord } = await import('./orderController.js');
const { updateOrderStatusSecure } = await import('./orderWorkflowController.js');
afterEach(() => mock.restoreAll()); after(() => pool.end());

test('COD pending, processing and shipped stay pending; delivered becomes paid; cancellation never implies paid', () => {
  for (const status of ['pending','processing','packed','shipped','out_for_delivery','cancelled','returned']) {
    assert.equal(mapOrderRecord({ payment_method: 'cod', status }).payment_status, 'pending', status);
    assert.equal(mapOrderRecord({ payment_method: 'cod', status, payment_status: 'pending' }).payment_status, 'pending');
  }
  assert.equal(mapOrderRecord({ payment_method: 'cod', status: 'delivered' }).payment_status, 'paid');
  assert.equal(mapOrderRecord({ payment_method: 'gcash', status: 'shipped', payment_status: 'paid' }).payment_status, 'paid');
});
test('staff delivery captures COD payment in the transaction; invalid terminal orders/payments cannot be captured', async () => {
  for (const [status, method, paymentStatus, expected] of [['out_for_delivery','cod','pending',200],['cancelled','cod','cancelled',409],['returned','cod','failed',409],['out_for_delivery','cod','failed',409],['out_for_delivery','gcash','paid',200]]) {
    const queries = []; const order = { id: 1, user_id: 7, status, payment_method: method, payment_status: paymentStatus };
    const client = { release() {}, async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT * FROM orders')) return { rows: [order], rowCount: 1 };
      if (sql.includes('UPDATE payments SET status =')) return { rows: paymentStatus === 'pending' ? [{ id: 3 }] : [], rowCount: paymentStatus === 'pending' ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    } };
    mock.method(pool, 'connect', async () => client);
    mock.method(pool, 'query', async () => ({ rows: [], rowCount: 0 }));
    const res = { code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await updateOrderStatusSecure({ params: { id: 1 }, body: { status: 'delivered' }, user: { id: 2, role: 'store_staff' }, get() {} }, res);
    assert.equal(res.code, expected);
    assert.equal(queries.some(sql => sql.includes("payment_status = 'paid'")), method === 'cod' && expected === 200);
    if (expected === 200) assert.ok(queries.includes('COMMIT'));
    else assert.ok(queries.includes('ROLLBACK'));
    mock.restoreAll();
  }
});
