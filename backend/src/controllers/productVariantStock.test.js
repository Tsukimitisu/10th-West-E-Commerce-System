import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE = 'postgres';
const { default: pool } = await import('../config/database.js');
const { getProductById } = await import('./productController.js');
const { calculateEcommercePrice } = await import('../services/catalogPricing.js');
afterEach(() => mock.restoreAll());
after(async () => pool.end());
for (const reserved of [0, 2, 8]) {
  test(`storefront variant excludes ${reserved} reserved units from 5 physical units`, async () => {
    mock.method(pool, 'query', async sql => {
      if (String(sql).includes('FROM products p')) return { rows: [{ id: 11, name: 'Test part', inventory_status: 'active', visibility_status: 'active', stock_quantity: 5, price: 100, store_selling_price: 100 }] };
      if (String(sql).includes('FROM product_variants')) return { rows: [{ id: 71, product_id: 11, stock_quantity: 5, reserved_stock: reserved, price: reserved === 2 ? null : 100, price_adjustment: 20, option_combination: { Color: 'Black' } }] };
      return { rows: [] };
    });
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await getProductById({ params: { id: 11 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.variants[0].stock_quantity, Math.max(0, 5 - reserved));
    assert.equal(res.body.variants[0].product_id, 11);
    assert.equal(res.body.variants[0].price, calculateEcommercePrice(reserved === 2 ? 120 : 100));
  });
}
