import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCoreEnvironment } from './productionConfig.js';

const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  FRONTEND_ORIGIN: 'https://store.example.test',
  SESSION_STORE: 'postgres',
  COOKIE_SECURE: 'true',
  COOKIE_SAME_SITE: 'lax',
  JWT_SECRET: `jwt-${'a'.repeat(48)}`,
  SESSION_SECRET: `session-${'b'.repeat(48)}`,
  CSRF_SECRET: `csrf-${'c'.repeat(48)}`,
  TWO_FACTOR_ENCRYPTION_KEY: `two-factor-${'d'.repeat(48)}`,
  SHIPPING_PROVIDER: 'bigseller',
  TRACKING_PROVIDER: 'aftership',
  ...overrides,
});

test('production core validation accepts strong distinct secrets and secure cookie settings', () => {
  const result = validateCoreEnvironment(productionEnvironment({ NODE_ENV: 'Production' }));
  assert.equal(result.isProduction, true);
  assert.equal(result.frontendOrigin, 'https://store.example.test');
});

test('production core validation rejects placeholders, reused secrets, and insecure settings', () => {
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ JWT_SECRET: 'your-super-secret-jwt-key-change-this-in-production' })),
    { code: 'PRODUCTION_SECRET_INVALID' }
  );
  const reused = `unique-${'x'.repeat(48)}`;
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({
      JWT_SECRET: reused,
      SESSION_SECRET: reused,
      CSRF_SECRET: reused,
      TWO_FACTOR_ENCRYPTION_KEY: reused,
    })),
    { code: 'PRODUCTION_SECRETS_REUSED' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ COOKIE_SECURE: 'false' })),
    { code: 'PRODUCTION_COOKIE_SECURE_REQUIRED' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ FRONTEND_ORIGIN: 'http://store.example.test' })),
    { code: 'PRODUCTION_FRONTEND_ORIGIN_INVALID' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ SHIPPING_PROVIDER: 'mock' })),
    { code: 'PRODUCTION_MOCK_PROVIDER_BLOCKED' }
  );
});

test('development still requires JWT but does not require production-only settings', () => {
  assert.deepEqual(validateCoreEnvironment({ NODE_ENV: 'development', JWT_SECRET: 'development-only' }), {
    isProduction: false,
    nodeEnvironment: 'development',
  });
  assert.throws(() => validateCoreEnvironment({ NODE_ENV: 'development' }), { code: 'CORE_ENV_MISSING' });
});

