import test from 'node:test';
import assert from 'node:assert/strict';
import { availableStock, cartAddPayload } from '../utils/cartProduct.js';

test('shared cart availability respects reservations without subtracting API availability twice', () => {
  assert.equal(availableStock({ stock_quantity: 5 }), 5);
  assert.equal(availableStock({ stock_quantity: 5, reserved_stock: 3 }), 2);
  assert.equal(availableStock({ stock_quantity: 2, available_stock: 2, reserved_stock: 3 }), 2);
  assert.equal(availableStock({ stock_quantity: 0, variants: [{ stock_quantity: 5, reserved_stock: 3 }] }), 2);
  assert.equal(availableStock({ stock_quantity: 10, available_stock: 10, selected_variant: { stock_quantity: 3, available_stock: 3 } }), 3);
  assert.equal(availableStock({ stock_quantity: 2, reserved_stock: 5 }), 0);
  assert.equal(availableStock({ stock_quantity: 5, inventory_status: 'inactive' }), 0);
});

test('Shop, wishlist and product-view identities produce the same cart-add payload', () => {
  const expected = { product_id: 7, variant_id: null, quantity: 1 };
  assert.deepEqual(cartAddPayload({ id: 7 }, 1), expected);
  assert.deepEqual(cartAddPayload({ id: 999, product_id: 7 }, 1), expected);
  assert.deepEqual(cartAddPayload({ id: 99, inventory_item_id: 7 }, 1), expected);
  assert.deepEqual(cartAddPayload({ id: 7, selected_variant: { id: 20 } }, 2), { product_id: 7, variant_id: 20, quantity: 2 });
  assert.deepEqual(cartAddPayload({ id: 7 }, 1, { listingId: 99 }), { ...expected, listing_id: 99 });
});
