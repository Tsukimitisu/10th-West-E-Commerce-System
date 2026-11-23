import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiUrl, validateProductionApiUrl } from '../api-url.js';

test('normalizes an API URL without changing its origin or path', () => {
  assert.equal(
    normalizeApiUrl(' https://store-api.onrender.com/api/// '),
    'https://store-api.onrender.com/api'
  );
});

test('accepts a public HTTPS production API ending in /api', () => {
  assert.equal(
    validateProductionApiUrl('https://store-api.onrender.com/api/'),
    'https://store-api.onrender.com/api'
  );
});

test('rejects missing, loopback, insecure, and malformed production API URLs', () => {
  for (const value of [
    '',
    'http://localhost:5000/api',
    'http://127.0.0.1:5000/api',
    'http://store-api.onrender.com/api',
    'https://store-api.onrender.com',
    'https://user:password@store-api.onrender.com/api',
    'https://store-api.onrender.com/api?token=secret',
  ]) {
    assert.throws(() => validateProductionApiUrl(value), /VITE_API_URL/);
  }
});
