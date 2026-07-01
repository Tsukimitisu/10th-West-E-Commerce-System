import assert from 'node:assert/strict';
import test from 'node:test';
import { assertShippingProviderSchema, assertWaybillProviderSchema } from './shippingSchema.js';

const requiredRows = [
  'shipping_provider',
  'tracking_provider',
  'provider_tracking_id',
  'provider_status',
  'normalized_status',
  'booking_error',
].map((column_name) => ({ column_name }));

test('shipping schema guard accepts the complete provider schema', async () => {
  await assert.doesNotReject(() => assertShippingProviderSchema({
    query: async () => ({ rows: requiredRows }),
  }));
});

test('shipping schema guard returns a safe service error for incomplete schema', async () => {
  await assert.rejects(
    () => assertShippingProviderSchema({ query: async () => ({ rows: [] }) }),
    (error) => (
      error.code === 'SHIPPING_SCHEMA_NOT_READY'
      && error.status === 503
      && !/column .* does not exist/i.test(error.message)
    )
  );
});

test('waybill schema guard rejects incomplete provider fields safely', async () => {
  await assert.rejects(
    () => assertWaybillProviderSchema({ query: async () => ({ rows: [{ column_name: 'provider' }] }) }),
    (error) => error.code === 'WAYBILL_SCHEMA_NOT_READY' && error.status === 503
  );
});

test('waybill schema guard accepts all provider fields', async () => {
  await assert.doesNotReject(() => assertWaybillProviderSchema({
    query: async () => ({
      rows: ['provider', 'label_url', 'last_reprinted_at'].map((column_name) => ({ column_name })),
    }),
  }));
});
