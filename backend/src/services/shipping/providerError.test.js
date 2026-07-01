import assert from 'node:assert/strict';
import test from 'node:test';
import {
  notConfigured,
  providerHttpStatus,
  publicProviderError,
} from './providerError.js';

test('provider errors include a normalized unsuccessful response', () => {
  const error = notConfigured('bigseller', ['BIGSELLER_APP_SECRET']);
  assert.equal(providerHttpStatus(error), 503);
  assert.deepEqual(publicProviderError(error), {
    success: false,
    code: 'PROVIDER_NOT_CONFIGURED',
    message: 'bigseller is not configured.',
    provider: 'bigseller',
  });
});

test('database errors are replaced with a safe generic response', () => {
  const error = new Error('column shipping_provider does not exist');
  error.code = '42703';
  assert.equal(providerHttpStatus(error), 500);
  const result = publicProviderError(error);
  assert.equal(result.success, false);
  assert.equal(result.code, 'SHIPPING_PROVIDER_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /column|42703|shipping_provider/);
});
