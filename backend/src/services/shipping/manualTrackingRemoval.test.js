import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANUAL_SHIPMENT_STATUSES, assertManualWaybillEligible } from '../../controllers/shipmentController.js';
import pool from '../../config/database.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

after(async () => {
  await pool.end().catch(() => {});
});

test('legacy manual tracking mutation route is removed', async () => {
  const source = await readFile(path.resolve(directory, '../../routes/shipping.js'), 'utf8');
  assert.doesNotMatch(source, /router\.put\s*\(\s*['"]\/tracking\/:orderId/);
  assert.doesNotMatch(source, /UPDATE orders[\s\S]*tracking_number/);
});

test('manual tracking uses only the allowed status vocabulary', () => {
  assert.deepEqual(MANUAL_SHIPMENT_STATUSES, [
    'pending', 'waybill_created', 'picked_up', 'in_transit', 'out_for_delivery',
    'delivered', 'failed', 'cancelled', 'returned',
  ]);
});

test('COD waybill eligibility requires a confirmed or processing order', () => {
  assert.doesNotThrow(() => assertManualWaybillEligible({ status: 'processing', payment_method: 'cod', shipping_method: 'standard' }));
  assert.throws(
    () => assertManualWaybillEligible({ status: 'pending', payment_method: 'cod', shipping_method: 'standard' }),
    (error) => error.code === 'COD_ORDER_NOT_CONFIRMED'
  );
});
