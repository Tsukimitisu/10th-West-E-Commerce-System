import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotCheckoutCart, clearPaidCheckoutCart } from './paidCart.js';

const fixture = ({ status = 'paid', source = 'cart', missingSnapshot = false } = {}) => {
  const rows = [{ id: 10, user_id: 7, product_id: 11, variant_id: 4, quantity: 3 }, { id: 20, user_id: 7, product_id: 12, variant_id: null, quantity: 1 }];
  const order = { user_id: 7, payment_method: 'gcash', payment_status: status, payment_metadata: { cart_checkout: missingSnapshot ? undefined : { source, lines: [{ id: 10, product_id: 11, variant_id: 4, quantity: 2 }] } } };
  const client = { async query(sql, values = []) {
    if (sql.includes('FROM orders')) return { rows: [order], rowCount: 1 };
    if (sql.includes('FROM cart_items')) {
      const found = sql.includes('ci.id = $1') ? rows.filter(row => row.id === values[0] && row.user_id === values[1] && row.product_id === values[2] && row.variant_id === values[3]) : rows;
      return { rows: found, rowCount: found.length };
    }
    if (sql.startsWith('UPDATE cart_items')) rows.find(row => row.id === values[0]).quantity -= values[1];
    if (sql.startsWith('DELETE FROM cart_items')) rows.splice(rows.findIndex(row => row.id === values[0]), 1);
    if (sql.includes('jsonb_set')) order.payment_metadata.cart_checkout.completed_at = 'completed';
    return { rows: [], rowCount: 1 };
  } };
  return { rows, order, client };
};
test('paid GCash subtracts only purchased quantity, retains unrelated items/variants, and is idempotent on refresh', async () => {
  const f = fixture();
  f.rows.push({ id: 30, user_id: 7, product_id: 11, variant_id: 5, quantity: 1 });
  await clearPaidCheckoutCart(f.client, 1);
  assert.deepEqual(f.rows.map(row => [row.id, row.quantity]), [[10, 1], [20, 1], [30, 1]]);
  await clearPaidCheckoutCart(f.client, 1);
  assert.equal(f.rows[0].quantity, 1);
});
test('pending, unknown, failed and cancelled payments preserve cart contents', async () => {
  for (const status of ['pending', 'unknown', 'failed', 'cancelled']) {
    const f = fixture({ status }); await clearPaidCheckoutCart(f.client, 1);
    assert.equal(f.rows[0].quantity, 3); assert.equal(f.order.payment_metadata.cart_checkout.completed_at, undefined);
  }
});
test('Buy Now, COD, and legacy orders without a safe snapshot do not clear normal cart contents', async () => {
  for (const options of [{ source: 'buy_now' }, { missingSnapshot: true }, {}]) {
    const f = fixture(options); if (!Object.keys(options).length) f.order.payment_method = 'cod';
    await clearPaidCheckoutCart(f.client, 1); assert.equal(f.rows[0].quantity, 3);
  }
});
test('removed/re-added cart lines and another account cannot be deleted using an old checkout snapshot', async () => {
  const f = fixture(); f.rows[0].id = 99;
  await clearPaidCheckoutCart(f.client, 1); assert.equal(f.rows[0].quantity, 3);
  const other = fixture(); other.rows[0].user_id = 8;
  await clearPaidCheckoutCart(other.client, 1); assert.equal(other.rows[0].quantity, 3);
});
test('snapshot records actual owned cart IDs and real variant selection; Buy Now needs no cart read', async () => {
  const f = fixture(); const items = [{ product_id: 11, variant_id: 4, quantity: 2 }];
  assert.deepEqual(await snapshotCheckoutCart(f.client, { userId: 7, items, source: 'cart' }), { source: 'cart', lines: [{ id: 10, product_id: 11, variant_id: 4, quantity: 2 }] });
  assert.deepEqual(await snapshotCheckoutCart({ query() { assert.fail('Buy Now must not read normal cart'); } }, { items, source: 'buy_now' }), { source: 'buy_now', lines: [] });
});
