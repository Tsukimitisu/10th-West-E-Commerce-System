import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStatus, toPublicProviderStatus } from './providerUtils.js';

test('normalizes standard shipment statuses', () => {
  assert.equal(normalizeStatus('Delivered'), 'delivered');
  assert.equal(normalizeStatus('OutForDelivery'), 'out_for_delivery');
  assert.equal(normalizeStatus('InTransit'), 'in_transit');
  assert.equal(normalizeStatus('AttemptFail'), 'failed_delivery');
  assert.equal(normalizeStatus('Exception'), 'failed_delivery');
  assert.equal(normalizeStatus('Cancelled'), 'cancelled');
  assert.equal(normalizeStatus('unmapped provider state'), 'unknown');
});

test('normalizes returned-to-sender variants before generic exceptions', () => {
  assert.equal(normalizeStatus('Exception', 'Exception_011'), 'returned');
  assert.equal(normalizeStatus('Returned to sender'), 'returned');
  assert.equal(normalizeStatus('Return to origin'), 'returned');
  assert.equal(normalizeStatus('returned'), 'returned');
  assert.equal(normalizeStatus('RTS'), 'returned');
});

test('maps internal readiness to public-safe provider statuses', () => {
  assert.equal(toPublicProviderStatus({ ready: true }), 'configured');
  assert.equal(toPublicProviderStatus({ status: 'blocked_by_credentials' }), 'blocked_by_credentials');
  assert.equal(toPublicProviderStatus({ status: 'not_implemented' }), 'not_implemented');
  assert.equal(toPublicProviderStatus({ mock: true, status: 'development_mock' }), 'mock_dev_only');
  assert.equal(toPublicProviderStatus({ status: 'unsupported_provider' }), 'unavailable');
});
