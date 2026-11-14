import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCartPriceChanges } from '../utils/cartPriceChanges.js';

test('server cart sync reports a changed cached unit price without using that price for totals', () => {
  const cached = [{ productId: 7, variantId: 2, product: { name: 'Brake pad', price: 100 } }];
  const current = [{ productId: 7, variantId: 2, product: { name: 'Brake pad', price: 120 } }];
  assert.deepEqual(detectCartPriceChanges(cached, current), [
    { productId: 7, name: 'Brake pad', currentPrice: 120 },
  ]);
  assert.deepEqual(detectCartPriceChanges(current, current), []);
});

test('price notices require the same product variant and handle a missing sale price', () => {
  const cached = [{ productId: 7, variantId: 1, product: { price: 100 } }];
  const current = [{ productId: 7, variantId: 2, product: { price: 120 } }];
  assert.deepEqual(detectCartPriceChanges(cached, current), []);
  assert.deepEqual(detectCartPriceChanges([], current), []);
  assert.deepEqual(detectCartPriceChanges(
    [{ productId: 7, product: { price: 120, is_on_sale: true, sale_price: null } }],
    [{ productId: 7, product: { price: 120, is_on_sale: true, sale_price: null } }],
  ), []);
});
