import assert from 'node:assert/strict';
import test from 'node:test';
import { getShippingOperationalReadiness } from './shippingReadiness.js';

test('shipping readiness falls back safely when provider schema is missing', async () => {
  const db = {
    query: async () => {
      const error = new Error('internal database detail');
      error.code = '42703';
      throw error;
    },
  };
  const result = await getShippingOperationalReadiness(db);
  assert.deepEqual(result, {
    schema_status: 'migration_required',
    last_successful_booking: null,
    last_tracking_refresh: null,
    last_webhook_received: null,
    recent_provider_errors: [],
  });
});

test('shipping readiness returns sanitized operational activity', async () => {
  const responses = [
    { rows: [{ last_successful_booking: '2026-07-01', last_tracking_refresh: null, last_webhook_received: null }] },
    { rows: [{ order_id: 10, message: 'Provider unavailable', updated_at: '2026-07-01' }] },
  ];
  const result = await getShippingOperationalReadiness({ query: async () => responses.shift() });
  assert.equal(result.schema_status, 'ready');
  assert.equal(result.last_successful_booking, '2026-07-01');
  assert.equal(result.recent_provider_errors.length, 1);
  assert.equal(result.recent_provider_errors[0].message, 'Shipping provider operation failed.');
});
