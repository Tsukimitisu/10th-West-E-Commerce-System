import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { __testing } from '../../controllers/shipmentController.js';
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

test('provider tracking cannot regress or skip completed order transitions', () => {
  const { isAllowedTrackingOrderTransition } = __testing;
  assert.equal(isAllowedTrackingOrderTransition('ready_for_pickup', 'shipped'), true);
  assert.equal(isAllowedTrackingOrderTransition('shipped', 'out_for_delivery'), true);
  assert.equal(isAllowedTrackingOrderTransition('out_for_delivery', 'delivered'), true);
  assert.equal(isAllowedTrackingOrderTransition('delivered', 'shipped'), false);
  assert.equal(isAllowedTrackingOrderTransition('pending', 'delivered'), false);
  assert.equal(isAllowedTrackingOrderTransition('cancelled', 'shipped'), false);
});
