import assert from 'node:assert/strict';
import test from 'node:test';
import { getLoginSubmissionErrorMessage } from '../utils/authErrors.js';

test('CSRF expiry gives actionable feedback without changing invalid-credential and outage handling', () => {
  const expired = 'Your session expired. Please refresh and try again.';
  assert.equal(getLoginSubmissionErrorMessage({ code: 'CSRF_INVALID_TOKEN', message: 'Invalid CSRF token', status: 403 }), expired);
  assert.equal(getLoginSubmissionErrorMessage({ code: 'CSRF_TOKEN_UNAVAILABLE' }), expired);
  assert.equal(getLoginSubmissionErrorMessage({ status: 403, message: 'Invalid csrf token' }), expired);
  assert.equal(getLoginSubmissionErrorMessage({ code: 'INVALID_CREDENTIALS', status: 401, message: 'Invalid email or password.' }), 'Invalid email or password.');
  assert.equal(getLoginSubmissionErrorMessage({ code: 'DATABASE_UNAVAILABLE', status: 503, message: 'private backend detail' }), 'The service is temporarily unavailable. Please try again later.');
});
