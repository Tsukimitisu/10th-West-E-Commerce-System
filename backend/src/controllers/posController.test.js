import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import { __testing } from './posController.js';

after(async () => {
  await pool.end().catch(() => {});
});

test('POS cart normalization merges duplicate product and variant rows', () => {
  assert.deepEqual(
    __testing.normalizeCartItems([
      { product_id: 10, variant_id: 2, quantity: 1 },
      { productId: 10, variantId: 2, quantity: 2 },
      { product_id: 11, quantity: 1 },
    ]),
    [
      { product_id: 10, variant_id: 2, quantity: 3 },
      { product_id: 11, variant_id: null, quantity: 1 },
    ],
  );
});

test('POS cart normalization rejects zero and negative quantities', () => {
  assert.throws(
    () => __testing.normalizeCartItems([{ product_id: 10, quantity: 0 }]),
    /quantity from 1 to 100/,
  );
  assert.throws(
    () => __testing.normalizeCartItems([{ product_id: 10, quantity: -1 }]),
    /quantity from 1 to 100/,
  );
});

test('POS currency rounding is stable', () => {
  assert.equal(__testing.round(10.005), 10.01);
  assert.equal(__testing.round(99.999), 100);
});
