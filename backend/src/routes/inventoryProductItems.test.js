import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';

const { default: pool } = await import('../config/database.js');
const { default: inventoryRouter } = await import('./inventory.js');
const { buildProductItemsQuery } = await import('../controllers/inventoryProductItemsController.js');

test('product items query searches inventory fields, filters, paginates, and uses whitelisted sorting', () => {
  const query = buildProductItemsQuery({ q: 'BB3', partNumber: 'BB3', itemName: 'panel', color: 'Black',
    brand: 'Yamaha', motorcycleModel: 'Mio', category: 'Body', location: 'A-01',
    stockStatus: 'low_stock', page: '2', pageSize: '10', sortBy: 'price', sortDir: 'desc' });
  assert.match(query.itemsSql, /FROM products p/);
  assert.match(query.itemsSql, /p\.part_number ILIKE \$1 OR p\.name ILIKE \$2/);
  assert.match(query.itemsSql, /p\.box_number ILIKE/);
  assert.match(query.itemsSql, /p\.stock_quantity > 0 AND p\.stock_quantity <= p\.low_stock_threshold/);
  assert.match(query.itemsSql, /ORDER BY COALESCE\(p\.store_selling_price, p\.price\) DESC/);
  assert.deepEqual(query.itemValues.slice(-2), [10, 10]);
  assert.ok(query.itemValues.includes('%BB3%'));
  assert.ok(query.itemValues.includes('%panel%'));
  assert.match(buildProductItemsQuery({ sortBy: 'p.price; DROP TABLE products' }).itemsSql, /ORDER BY p\.name ASC/);
  assert.equal(buildProductItemsQuery({ pageSize: '9999' }).pageSize, 100);
});

test('product items HTTP route is role protected, read-only, and returns safe inventory fields', async () => {
  const originalQuery = pool.query;
  const calls = [];
  const row = { id: 7, part_number: 'BB3-123', name: 'Mio Side Panel', color: 'Black',
    price: '350.00', stock_quantity: 12, low_stock_threshold: 3, box_number: 'Box A-01',
    box_location: 'Shelf 2', brand: 'Yamaha', motorcycle_model: 'Mio', category: 'Body Parts',
    status: 'active', buying_price: '100.00', supplier_id: 42 };
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM sessions')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM users')) return { rows: [{ id: 1, role: currentRole,
      is_active: true, is_deleted: false, email_verified: true }] };
    if (sql.includes('FROM permissions p')) return { rows: [{ has_permission: !denyPermission }] };
    if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 1 }] };
    if (sql.includes('SELECT p.id, p.part_number')) return { rows: [row] };
    return { rows: [] };
  };
  let currentRole = 'store_staff';
  let denyPermission = false;
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers['x-test-role']) req.session = { auth: { userId: 1, tokenHash: 'a'.repeat(64) } };
    next();
  });
  app.use('/api/inventory', inventoryRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = `http://127.0.0.1:${server.address().port}/api/inventory/product-items`;
    for (const role of ['store_staff', 'admin', 'owner', 'super_admin']) {
      currentRole = role;
      const response = await fetch(`${url}?q=BB3&page=2&pageSize=10&sortBy=partNumber`, { headers: { 'x-test-role': role } });
      assert.equal(response.status, 200, role);
      const body = await response.json();
      assert.equal(body.items[0].partNumber, 'BB3-123');
      assert.equal(body.items[0].itemName, 'Mio Side Panel');
      assert.equal(body.items[0].price, 350);
      assert.equal(body.items[0].boxNumber, 'Box A-01');
      assert.equal(body.page, 2);
      assert.equal(body.total, 1);
      assert.equal(body.items[0].buying_price, undefined);
      assert.equal(body.items[0].supplier_id, undefined);
    }
    currentRole = 'customer';
    assert.equal((await fetch(url, { headers: { 'x-test-role': 'customer' } })).status, 403);
    assert.equal((await fetch(url)).status, 401);
    currentRole = 'store_staff';
    denyPermission = true;
    assert.equal((await fetch(url, { headers: { 'x-test-role': 'store_staff' } })).status, 403);
    denyPermission = false;
    assert.equal((await fetch(url, { method: 'PUT', headers: { 'x-test-role': 'store_staff' } })).status, 405);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'x-test-role': 'store_staff' } })).status, 405);
    assert.equal((await fetch(url, { method: 'DELETE', headers: { 'x-test-role': 'store_staff' } })).status, 405);
    assert.ok(calls.some((call) => call.sql.includes('FROM products p') && call.values.includes('%BB3%')));
    assert.ok(!calls.some((call) => /(?:INSERT|UPDATE|DELETE)\s+products/i.test(call.sql)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    await pool.end().catch(() => {});
  }
});
