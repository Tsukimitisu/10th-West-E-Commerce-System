import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/invoice_auth_test';
const { default: pool } = await import('../config/database.js');
const { default: router } = await import('./orders.js');
after(() => pool.end().catch(() => {}));

test('invoice route preserves authentication, customer ownership and authorized Owner access', async () => {
  let user = { id: 7, role: 'customer', is_active: true, email_verified: true, two_factor_enabled: false };
  const handlers = router.stack.find(layer => layer.route?.path === '/:id/invoice').route.stack.map(layer => layer.handle);
  assert.equal(handlers.length, 3, 'authentication and operations permission middleware remain installed');
  mock.method(pool, 'query', async (sql, args = []) => {
    const query = String(sql);
    if (query.includes('FROM system_settings')) return { rows: [] };
    if (query.includes('SELECT id FROM sessions')) return { rows: [{ id: 1 }] };
    if (query.includes('FROM users')) return { rows: [{ ...user }] };
    if (query.includes('UPDATE sessions SET last_active')) return { rows: [], rowCount: 1 };
    if (query.includes('FROM orders o LEFT JOIN users')) return { rows: [{
      id: Number(args[0]), user_id: args[0] === '42' ? 7 : 8,
      payment_method: 'cod', payment_status: 'pending', status: 'shipped',
      total_amount: 100, shipping_fee: 0,
    }] };
    if (query.includes('FROM order_items')) return { rows: [{ product_name: 'Test part', product_price: 100, quantity: 1 }] };
    throw new Error(`Unexpected test query: ${query}`);
  });
  const request = async (id, authenticated = true) => {
    const req = { params: { id }, headers: {}, originalUrl: `/api/orders/${id}/invoice`,
      ...(authenticated ? { session: { auth: { userId: user.id, tokenHash: 'a'.repeat(64) } } } : {}) };
    const res = { statusCode: 200, headers: {}, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
      setHeader(key, value) { this.headers[key] = value; } };
    for (const handler of handlers) {
      let next = false;
      await handler(req, res, () => { next = true; });
      if (!next) break;
    }
    return res;
  };
  try {
    const guest = await request('42', false);
    assert.equal(guest.statusCode, 401);
    assert.equal(guest.body.code, 'AUTH_TOKEN_REQUIRED');
    const own = await request('42');
    assert.equal(own.statusCode, 200);
    assert.equal(own.headers['Content-Type'], 'text/html');
    assert.equal(own.headers['Cache-Control'], 'private, no-store');
    assert.match(own.body, /Payment Pending/);
    assert.match(own.body, /@page\{size:A4/);
    const other = await request('43');
    assert.equal(other.statusCode, 403);
    assert.equal(other.body.message, 'Access denied');
    user = { ...user, id: 1, role: 'owner' };
    const owner = await request('43');
    assert.equal(owner.statusCode, 200);
    assert.match(owner.body, /INVOICE/);
  } finally { mock.restoreAll(); }
});
