import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { __testing } from '../utils/reportExports.js';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('payment return page polls backend status and renders the saved shipping address', async () => {
  const source = await read('pages/customer/PaymentResult.jsx');
  assert.match(source, /getPaymentOrderStatus\(orderId\)/);
  assert.match(source, /shipping_address_snapshot/);
  assert.match(source, /Shipping address/);
  assert.match(source, /GCash via PayMongo/);
  assert.doesNotMatch(source, /payment procedure/i);
});

test('OAuth callback validates the current session before non-blocking CSRF refresh and navigation', async () => {
  const source = await read('pages/OAuthCallback.jsx');
  const profileIndex = source.indexOf('withTimeout(completeLegacyExchange.then(() => getProfile()))');
  const loginIndex = source.indexOf('onLoginRef.current(user)');
  const csrfIndex = source.indexOf('void refreshCsrfAfterSessionRotation()');
  const navigateIndex = source.indexOf("navigate('/', { replace: true })");
  assert.ok(profileIndex >= 0);
  assert.ok(loginIndex > profileIndex);
  assert.ok(csrfIndex > loginIndex);
  assert.ok(navigateIndex > csrfIndex);
});

test('owner refunds are exposed only for an approved return request', async () => {
  const source = await read('pages/owner/OrdersView.jsx');
  assert.match(source, /detailOrder\.return_request\?\.status === 'approved'/);
  assert.match(source, /processRefund\(approvedReturn\.id/);
  assert.match(source, /Refund can only be processed after an approved return\/refund request/);
});

test('report export produces human-readable CSV headers and data-based paginated print tables', () => {
  const csv = __testing.rowsToCsv([{ order_number: 'TWM-1', total_amount: '1250.50' }]);
  assert.match(csv, /"Order Number","Total Amount"/);
  const html = __testing.tableHtml({ title: 'Orders', rows: [{ order_number: 'TWM-1' }] });
  assert.match(html, /<table>/);
  assert.match(html, /<thead>/);
  assert.match(html, /TWM-1/);
});
