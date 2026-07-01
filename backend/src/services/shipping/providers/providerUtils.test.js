import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStatus } from './providerUtils.js';

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
