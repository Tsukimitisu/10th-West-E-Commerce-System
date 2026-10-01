const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.resolve(__dirname, '..', '..', '..', 'migrations', '202606300003_shipping_provider_adapters.cjs');
const source = readFileSync(migrationPath, 'utf8');

test('shipping provider migration guards every schema mutation for repeat execution', () => {
  assert.match(source, /const addColumnIfMissing/);
  assert.match(source, /const dropColumnIfPresent/);

  for (const column of [
    'shipping_provider',
    'tracking_provider',
    'provider_tracking_id',
    'waybill_number',
    'label_url',
    'provider_status',
    'normalized_status',
    'last_tracking_refresh_at',
    'webhook_received_at',
    'booking_error',
  ]) {
    assert.match(source, new RegExp(`addColumnIfMissing\\(knex, 'shipments', '${column}'`));
  }
});
