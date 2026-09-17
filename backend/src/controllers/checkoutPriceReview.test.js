import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import { __testing } from './secureCheckoutController.js';

after(async () => { await pool.end().catch(() => {}); });

test('checkout refuses missing or stale displayed prices before creating an order', () => {
  assert.throws(() => __testing.normalizeItems([{ product_id: 1, quantity: 1 }]), /displayed price/);
  const [item] = __testing.normalizeItems([{ product_id: 1, quantity: 2, expected_unit_price: 517 }]);
  assert.equal(item.expected_unit_price, 517);
  assert.throws(() => __testing.assertExpectedUnitPrice(690, item.expected_unit_price), (error) => error.status === 409 && error.code === 'PRICE_CHANGED');
  assert.doesNotThrow(() => __testing.assertExpectedUnitPrice(517, item.expected_unit_price));
  assert.deepEqual(__testing.normalizeItems([{ product_id: 1, quantity: 1 }], { requireExpectedPrice: false }), [
    { product_id: 1, variant_id: null, quantity: 1 },
  ]);
});

test('checkout refuses a total different from the confirmed display', () => {
  assert.throws(() => __testing.assertExpectedTotal(840, 667), (error) => error.status === 409 && error.code === 'TOTAL_CHANGED');
  assert.throws(() => __testing.assertExpectedTotal(840, undefined), (error) => error.status === 400);
  assert.doesNotThrow(() => __testing.assertExpectedTotal(840, 840));
});
