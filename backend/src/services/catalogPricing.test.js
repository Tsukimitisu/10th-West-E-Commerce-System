import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOMMERCE_MARKUP_RATE,
  calculateEcommercePrice,
  resolveEcommercePrice,
  resolveStoreSellingPrice,
  calculateCostPrice,
} from './catalogPricing.js';

test('e-commerce price is always the server-calculated 15 percent markup', () => {
  assert.equal(ECOMMERCE_MARKUP_RATE, 0.15);
  assert.equal(calculateEcommercePrice(850), 978);
  assert.equal(calculateEcommercePrice('199.99'), 230);
  assert.equal(calculateEcommercePrice(150), 173);
  assert.equal(resolveEcommercePrice({ store_selling_price: 100 }), 115);
});

test('cost price is eighty percent of the store price with cent rounding', () => {
  assert.equal(calculateCostPrice(150),120);
  assert.equal(calculateCostPrice('199.99'),159.99);
  assert.equal(calculateCostPrice(0),0);
  assert.throws(() => calculateCostPrice(-1), /non-negative/);
});

test('legacy price remains a safe store-price fallback during migration', () => {
  assert.equal(resolveStoreSellingPrice({ price: '250.00' }), 250);
  assert.equal(resolveStoreSellingPrice({ store_selling_price: '300', price: '250' }), 300);
  assert.throws(() => calculateEcommercePrice(-1), /non-negative/);
});
