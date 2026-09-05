import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`./${file}`, import.meta.url), 'utf8');

test('POS orders are locked in the staff status workflow', async () => {
  const source = await read('orderWorkflowController.js');
  const start = source.indexOf('export const updateOrderStatusSecure');
  const end = source.indexOf('export const cancelOrderSecure', start);
  const handler = source.slice(start, end);
  assert.match(handler, /order\.source.*pos/);
  assert.match(handler, /POS_ORDER_STATUS_LOCKED/);
  assert.match(handler, /In-store completed orders cannot be changed by store staff/);
  assert.match(handler, /ROLLBACK/);
});

test('receipt confirmation is transactionally idempotent and creates one notification', async () => {
  const source = await read('orderController.js');
  const start = source.indexOf('export const confirmOrderReceipt');
  const end = source.indexOf('// Cancel order', start);
  const handler = source.slice(start, end);
  assert.match(handler, /BEGIN/);
  assert.match(handler, /customer_confirmed_receipt_at IS NULL/);
  assert.match(handler, /shipping_status = 'completed'/);
  assert.match(handler, /'completed','Customer confirmed receipt'/);
  assert.match(handler, /already_confirmed: true/);
  assert.match(handler, /createUserNotification\(client/);
  assert.match(handler, /COMMIT/);
});

test('customer payment status endpoint relies on controller ownership instead of staff-only permission', async () => {
  const source = await readFile(new URL('../routes/payments.js', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/orders\/:orderId\/status', authenticateToken, getPaymentStatus\)/);
  assert.doesNotMatch(source, /router\.get\('\/orders\/:orderId\/status', authenticateToken, staffPermission/);
});
