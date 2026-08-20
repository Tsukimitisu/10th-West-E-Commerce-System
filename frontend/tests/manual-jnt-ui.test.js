import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('checkout displays the authenticated internal shipping quote and includes it in the total', async () => {
  const [checkout, api] = await Promise.all([
    read('pages/customer/Checkout.jsx'),
    read('services/api.js'),
  ]);
  assert.match(checkout, /getShippingQuote\(\{ address_id: Number\(selectedAddress\), items: shippingQuoteItems \}\)/);
  assert.match(checkout, /shippingQuote\?\.shipping_fee/);
  assert.match(checkout, /<span>Shipping<\/span>/);
  assert.match(checkout, /total \+ shippingCost/);
  assert.match(api, /\/shipping\/quote/);
  assert.match(api, /id: orderId/);
  assert.match(api, /order_id: orderId/);
  assert.match(api, /checkoutTotals\.shipping_fee/);
  assert.match(api, /shippingDetails\.provider/);
});

test('customer and admin order details display the saved shipping fee', async () => {
  const [customer, admin] = await Promise.all([
    read('pages/customer/OrderDetail.jsx'),
    read('pages/owner/OrdersView.jsx'),
  ]);
  assert.match(customer, /order\.shipping \?\? order\.shipping_fee/);
  assert.match(customer, /<span>Shipping<\/span>/);
  assert.match(admin, /<span>Shipping Fee<\/span>/);
  assert.match(admin, /detailOrder\.shipping/);
});

test('admin Create J&T Waybill action is permission and eligibility guarded', async () => {
  const source = await read('pages/owner/OrdersView.jsx');
  assert.match(source, /permissions\.has\('shipments\.manage'\)/);
  assert.match(source, /const canCreateWaybill = canManageShipments && waybillEligible && !activeShipment/);
  assert.match(source, /> Create J&T Waybill/);
  assert.match(source, /title="Create J&T Waybill"/);
});

test('admin can submit all manual waybill fields and sees duplicate validation errors', async () => {
  const [source, api] = await Promise.all([
    read('pages/owner/OrdersView.jsx'),
    read('services/api.js'),
  ]);
  for (const field of ['waybill_number', 'tracking_number', 'service_type', 'notes']) {
    assert.match(source, new RegExp(`waybillForm\\.${field}`));
  }
  assert.match(source, /createManualWaybill\(detailOrder\.id, waybillForm\)/);
  assert.match(source, /setStatusError\(e\.message/);
  assert.match(source, /\{statusError && <div[^>]*>\{statusError\}<\/div>\}/);
  assert.match(api, /\/shipments\/orders\/\$\{orderId\}\/waybill/);
});

test('customer sees manual J&T identifiers and timeline without admin controls', async () => {
  const source = await read('pages/customer/OrderDetail.jsx');
  assert.match(source, /Courier/);
  assert.match(source, /Waybill number/);
  assert.match(source, /Tracking number/);
  assert.match(source, /Shipping status/);
  assert.match(source, /tracking\.events\.map/);
  assert.match(source, /Tracking updates are manually encoded by the store/);
  assert.match(source, /official J&T tracker/);
  assert.doesNotMatch(source, /createManualWaybill|updateShipmentStatus|Create J&T Waybill|Update Shipment Status/);
});
