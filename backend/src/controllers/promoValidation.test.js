import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { validateDiscount, __testing } from './secureCheckoutController.js';
import { createPromotion } from './discountController.js';
import { readFile } from 'node:fs/promises';

after(() => pool.end());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('only eligible Owner promotions validate, using server prices and persisted usage', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE discounts(id serial PRIMARY KEY,code text,type text,value numeric,min_purchase numeric,max_discount numeric,
    max_uses int,per_user_limit int,is_active boolean,starts_at timestamptz,expires_at timestamptz,deleted_at timestamptz,updated_at timestamptz,used_count int DEFAULT 0);
    CREATE TABLE discount_usages(discount_id int,user_id int,status text);`);
  const query = async (sql, args) => {
    if (sql.includes('to_regclass')) return { rows: [{ ready: false }] };
    if (sql.includes('FROM products p')) return { rowCount: 1, rows: [{ price: 100, store_selling_price: 100, variant_price: null }] };
    const result = await db.query(sql, args); return { ...result, rowCount: result.rows.length };
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const validate = async code => {
    const res = response(); await validateDiscount({ user: { id: 9 }, body: { discount_code: code,
      items: [{ product_id: 1, quantity: 2 }], subtotal: 1, discount_amount: 9999, discount: 9999 } }, res); return res;
  };
  assert.equal((await validate('SAMPLE')).statusCode, 400); // Empty discounts table.
  assert.equal((await validate('')).statusCode, 400); // Apply must not claim success without a promo.
  const created = response();
  await createPromotion({ body: { code: 'OWNER20', type: 'percentage', value: 20, min_purchase: 100,
    max_discount: 40, max_uses: 10, per_user_limit: 1, is_active: true } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal((await validate('NONEXISTENT')).statusCode, 400);
  const valid = await validate('owner20');
  assert.equal(valid.statusCode, 200); assert.equal(valid.body.subtotal, 230); assert.equal(valid.body.discountAmount, 40);
  for (const change of ["is_active=false", "deleted_at=NOW()", "expires_at=NOW()-INTERVAL '1 hour'", "starts_at=NOW()+INTERVAL '1 hour'", 'used_count=10', 'min_purchase=500']) {
    await db.exec(`UPDATE discounts SET is_active=true,deleted_at=NULL,starts_at=NULL,expires_at=NULL,used_count=0,min_purchase=100; UPDATE discounts SET ${change}`);
    assert.equal((await validate('OWNER20')).statusCode, 400, change);
  }
  await db.exec('UPDATE discounts SET min_purchase=100; INSERT INTO discount_usages VALUES(1,9,\'consumed\');');
  assert.equal((await validate('OWNER20')).statusCode, 400);
});

test('checkout without a promotion is zero and never accepts a client discount amount', async () => {
  assert.deepEqual(await __testing.calculateDiscount({ query: () => assert.fail('No promo must not query/create discounts') }, 9, null, 230), { discount: 0, promotion: null });
  const source = await readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8');
  const checkout = source.slice(source.indexOf('export const createCheckout'), source.indexOf('const extractPaymongoEvent'));
  assert.match(checkout, /calculateDiscount\(client, req.user.id, req.body\?\.discount_code, subtotal\)/);
  assert.doesNotMatch(checkout, /req.body\?\.(?:discount_amount|discountAmount|discount)\b/);
});
