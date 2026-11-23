import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fulfillmentStep, fulfillmentSteps } from '../utils/orderProgress.js';

test('commerce timeline uses fulfillment milestones rather than assuming payment', () => {
  assert.deepEqual(fulfillmentSteps, ['Order Placed','Processing','Shipped','Out for Delivery','Delivered']);
  assert.equal(fulfillmentStep('pending'), 0); assert.equal(fulfillmentStep('processing'), 1);
  assert.equal(fulfillmentStep('shipped'), 2); assert.equal(fulfillmentStep('out_for_delivery'), 3);
  assert.equal(fulfillmentStep('delivered'), 4); assert.equal(fulfillmentStep('cancelled'), -1);
});
test('confirmed GCash refreshes authoritative cart and mobile account destinations reuse desktop definitions', async () => {
  const confirmation = await readFile(new URL('../pages/customer/OrderConfirmation.jsx', import.meta.url), 'utf8');
  assert.match(confirmation, /payment_method === 'gcash' && loadedOrder.payment_status === 'paid'/);
  assert.match(confirmation, /await getPaymentOrderStatus\(Number\(id\)\);\s*await syncCart\(\)/);
  const navbar = await readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8');
  assert.match(navbar, /path: '\/my-returns', label: 'Returns'/); assert.match(navbar, /path: '\/wishlist', label: 'Wishlist'/);
  assert.match(navbar, /customerExtraAccountNavigation\.map/); assert.match(navbar, /\.\.\.customerExtraAccountNavigation/);
});
