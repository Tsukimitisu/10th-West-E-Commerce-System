import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('return forms submit order_item_id and positive quantity', async () => {
  const requestReturn = await read('pages/customer/RequestReturn.jsx');
  const returnModal = await read('components/customer/ReturnModal.jsx');
  assert.match(requestReturn, /order_item_id:/);
  assert.match(requestReturn, /Math\.max\(1, Number\(item\.quantity\)/);
  assert.match(returnModal, /getOrderItemId/);
  assert.match(returnModal, /order_item_id: Number\(pid\)/);
  assert.doesNotMatch(requestReturn, /items: selectedPreview\.map\(\(item\) => \(\{\s*product_id:/s);
});

test('customer receipt action has immediate request guard and confirmed state', async () => {
  const source = await read('pages/customer/OrderDetail.jsx');
  assert.match(source, /receiptRequestInFlight/);
  assert.match(source, /order\.customer_confirmed_receipt_at/);
  assert.match(source, /Receipt Confirmed/);
  assert.match(source, /Confirming\.\.\./);
});

test('staff orders disable status changes for POS orders', async () => {
  const source = await read('pages/owner/OrdersView.jsx');
  assert.match(source, /isInStoreOrder/);
  assert.match(source, /POS_STATUS_LOCK_HELP/);
  assert.match(source, /Status Locked/);
  assert.match(source, /disabled=\{isInStoreOrder/);
});
