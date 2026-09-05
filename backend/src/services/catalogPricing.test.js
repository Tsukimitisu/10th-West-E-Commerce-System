import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOMMERCE_MARKUP_RATE,
  calculateEcommercePrice,
  resolveEcommercePrice,
  resolveStoreSellingPrice,
} from './catalogPricing.js';

test('e-commerce price is always the server-calculated 15 percent markup', () => {
  assert.equal(ECOMMERCE_MARKUP_RATE, 0.15);
  assert.equal(calculateEcommercePrice(850), 977.5);
  assert.equal(calculateEcommercePrice('199.99'), 229.99);
  assert.equal(resolveEcommercePrice({ store_selling_price: 100 }), 115);
});

test('legacy price remains a safe store-price fallback during migration', () => {
  assert.equal(resolveStoreSellingPrice({ price: '250.00' }), 250);
  assert.equal(resolveStoreSellingPrice({ store_selling_price: '300', price: '250' }), 300);
  assert.throws(() => calculateEcommercePrice(-1), /non-negative/);
});
