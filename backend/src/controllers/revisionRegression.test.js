import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { deleteAccountHandler } from './authController.js';
import { getProductById } from './productController.js';
import { addToCart } from './cartController.js';
import { createCheckout } from './secureCheckoutController.js';
import { variantAvailabilitySql } from '../services/inventory.js';

after(() => pool.end());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, clearCookie() {} });

test('direct account deletion rejects unfinished orders and unsettled payments but accepts settled final orders', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE TABLE orders(id int,user_id int,status text,payment_status text); CREATE TABLE payments(order_id int,status text);');
  let anonymized = false;
  t.mock.method(pool, 'query', async () => ({ rows: [], rowCount: 0 }));
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql, args) {
    if (sql.includes('SELECT password_hash, oauth_provider')) return { rows: [{ password_hash: null, oauth_provider: 'google', email: 'synthetic@example.test', is_active: true, is_deleted: false }] };
    if (/FROM orders\b/.test(sql)) { const result = await db.query(sql, args); return { ...result, rowCount: result.rows.length }; }
    if (sql.includes('UPDATE users')) anonymized = true;
    return { rows: [], rowCount: 1 };
  } }));
  const cases = [
    ...['pending','payment_pending','paid','processing','packed','ready_for_pickup','shipped','out_for_delivery','return_requested','return_approved','returned','refund_processing'].map(status => [status, 'paid', 409]),
    ['delivered','pending',409], ['delivered','unpaid',409], ['cancelled','processing',409], ['failed','pending',409],
    ['delivered','failed',409], ['cancelled','paid',409], ['failed','paid',409],
    ['delivered','paid',409,'processing'],
    ['delivered','paid',200], ['refunded','refunded',200], ['partially_refunded','partially_refunded',200], ['cancelled','cancelled',200], ['failed','failed',200],
  ];
  for (const [status, paymentStatus, expected, providerStatus] of cases) {
    await db.query('DELETE FROM orders'); await db.query('INSERT INTO orders VALUES(1,9,$1,$2)', [status, paymentStatus]);
    await db.query('DELETE FROM payments');
    if (providerStatus) await db.query('INSERT INTO payments VALUES(1,$1)', [providerStatus]);
    anonymized = false; const res = response();
    await deleteAccountHandler({ user: { id: 9, role: 'customer' }, body: { confirmation: 'DELETE' }, session: { auth: { authenticatedAt: Date.now() }, destroy(done) { done(); } } }, res);
    assert.equal(res.statusCode, expected, `${status}/${paymentStatus}`);
    assert.equal(anonymized, expected === 200);
    if (expected === 409) assert.match(res.body.message, /unfinished orders/);
  }
});

test('checkout revalidates the locked purchaser so concurrent account deletion cannot leave a new order', async t => {
  const calls = [];
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => ({ rows: [], rowCount: 0 }));
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql) {
    calls.push(sql);
    return { rows: sql.includes('FROM users') ? [{ is_active: false, is_deleted: true }] : [], rowCount: 0 };
  } }));
  const res = response();
  await createCheckout({ user: { id: 9 }, body: { items: [{ product_id: 1, quantity: 1, expected_unit_price: 115 }], payment_method: 'cod', address_id: 1, expected_total: 115 }, get: () => 'deleted-account-checkout' }, res);
  assert.equal(res.statusCode, 403);
  assert.ok(calls.some(sql => sql.includes('FOR KEY SHARE')));
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.some(sql => sql.includes('INSERT INTO orders')));
});

test('cart uses unreserved product/variant stock and includes existing line quantities without mutating inventory', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE products(id int PRIMARY KEY,stock_quantity int,reserved_stock int,inventory_status text,is_deleted boolean);
    CREATE TABLE product_variants(id int PRIMARY KEY,product_id int,stock_quantity int,reserved_stock int);
    CREATE TABLE ecommerce_listings(inventory_item_id int,visibility_status text);
    CREATE TABLE carts(id serial PRIMARY KEY,user_id int,session_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE cart_items(id serial PRIMARY KEY,cart_id int,product_id int,variant_id int,quantity int,updated_at timestamptz DEFAULT now());
    INSERT INTO products VALUES(1,5,0,'active',false),(2,0,0,'active',false),(3,5,3,'active',false),(4,0,0,'active',false),(5,5,0,'inactive',false),(6,5,0,'active',true);
    INSERT INTO product_variants VALUES(20,2,5,3);
    INSERT INTO ecommerce_listings SELECT id,'active' FROM products;`);
  assert.deepEqual((await db.query(`SELECT ${variantAvailabilitySql('p')} FROM products p WHERE p.id=2 GROUP BY p.id`)).rows,
    [{ has_variants: true, variant_available_stock: 2 }]);
  const query = async (sql, args) => { const result = await db.query(sql, args); return { ...result, rowCount: /^\s*SELECT/i.test(sql) ? result.rows.length : result.affectedRows ?? result.rows.length }; };
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const add = async (productId, quantity, variantId = null) => {
    const res = response();
    await addToCart({ user: { id: 9 }, body: { product_id: productId, quantity, variant_id: variantId } }, res);
    return res;
  };
  assert.equal((await add(1,1)).statusCode, 200);
  assert.equal((await add(1,2)).statusCode, 200);
  assert.equal((await add(1,3)).statusCode, 400); // Existing three plus three exceeds five.
  assert.equal((await add(3,2)).statusCode, 200);
  assert.equal((await add(3,1)).statusCode, 400); // Reserved units remain unavailable.
  assert.equal((await add(2,1)).statusCode, 400); // Selection is mandatory.
  assert.equal((await add(2,2,20)).statusCode, 200);
  assert.equal((await add(2,1,20)).statusCode, 400);
  assert.equal((await add(2,1,999)).statusCode, 400);
  assert.equal((await add(4,1)).statusCode, 400);
  assert.equal((await add(5,1)).statusCode, 404);
  assert.equal((await add(6,1)).statusCode, 404);
  assert.deepEqual((await db.query('SELECT product_id,variant_id,quantity FROM cart_items ORDER BY product_id')).rows, [
    { product_id: 1, variant_id: null, quantity: 3 }, { product_id: 2, variant_id: 20, quantity: 2 }, { product_id: 3, variant_id: null, quantity: 2 },
  ]);
  assert.deepEqual((await db.query('SELECT stock_quantity,reserved_stock FROM products WHERE id=3')).rows, [{ stock_quantity: 5, reserved_stock: 3 }]);
});

test('public product availability excludes reservations and exposes variant selection requirements', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('FROM products p') && sql.includes('WHERE p.id')) return { rows: [{ id: 7, name: 'Reserved part', price: 100, store_selling_price: 100, stock_quantity: 5, reserved_stock: 3, status: 'active', visibility_status: 'active', inventory_status: 'active', has_variants: false }] };
    return { rows: [], rowCount: 0 };
  });
  const res = response(); await getProductById({ params: { id: '7' }, query: {}, user: { id: 9, role: 'customer' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.available_stock, 2);
  assert.equal(res.body.stock_quantity, 2);
});
