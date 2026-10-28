import assert from 'node:assert/strict';
import test from 'node:test';
import { getCheckoutCartWarning } from '../utils/checkoutCartReview.js';

const item = (price, stock = 3, quantity = 1) => ({
  productId: 1,
  variantId: null,
  quantity,
  product: { price, stock_quantity: stock },
});

test('a changed item price requires review before order creation', () => {
  assert.match(getCheckoutCartWarning([item(517)], [item(690)]), /prices have changed/);
  assert.equal(getCheckoutCartWarning([item(690)], [item(690)]), null);
});

test('unavailable and insufficient stock block checkout', () => {
  assert.match(getCheckoutCartWarning([item(517)], []), /no longer available/);
  assert.match(getCheckoutCartWarning([item(517, 3, 2)], [item(517, 1, 2)]), /no longer available/);
  assert.match(getCheckoutCartWarning([item(517, 3, 2)], [item(517, 3, 1)]), /no longer available/);
});
