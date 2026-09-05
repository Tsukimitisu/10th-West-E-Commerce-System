import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCoreEnvironment } from './productionConfig.js';

const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:unitpassword@db.example.test/app',
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
  const result = validateCoreEnvironment(productionEnvironment({
    NODE_ENV: 'Production',
    CORS_ALLOWED_ORIGINS: 'https://admin.example.test, https://support.example.test',
  }));
  assert.equal(result.isProduction, true);
  assert.equal(result.frontendOrigin, 'https://store.example.test');
  assert.deepEqual(result.frontendOrigins, ['https://store.example.test']);
  assert.deepEqual(result.corsAllowedOrigins, ['https://admin.example.test', 'https://support.example.test']);
});

test('production safely validates both supported frontend origin aliases', () => {
  const result = validateCoreEnvironment(productionEnvironment({
    FRONTEND_URL: 'https://legacy-store.example.test/',
  }));
  assert.deepEqual(result.frontendOrigins, [
    'https://store.example.test',
    'https://legacy-store.example.test',
  ]);
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ FRONTEND_URL: 'http://legacy-store.example.test' })),
    { code: 'PRODUCTION_FRONTEND_URL_INVALID' }
  );
});

test('Vercel production origins require cross-site session and CSRF cookies', () => {
  const result = validateCoreEnvironment(productionEnvironment({
    FRONTEND_ORIGIN: 'https://store.vercel.app',
    COOKIE_SAME_SITE: 'none',
    CSRF_COOKIE_SAME_SITE: 'none',
  }));
  assert.equal(result.cookieSameSite, 'none');
  assert.equal(result.csrfCookieSameSite, 'none');

  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ FRONTEND_ORIGIN: 'https://store.vercel.app' })),
    { code: 'PRODUCTION_CROSS_SITE_COOKIE_SAMESITE_REQUIRED' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({
      FRONTEND_ORIGIN: 'https://store.vercel.app',
      COOKIE_SAME_SITE: 'none',
      CSRF_COOKIE_SAME_SITE: 'lax',
    })),
    { code: 'PRODUCTION_CROSS_SITE_COOKIE_SAMESITE_REQUIRED' }
  );
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
    () => validateCoreEnvironment(productionEnvironment({ CSRF_COOKIE_SAME_SITE: 'invalid' })),
    { code: 'PRODUCTION_CSRF_COOKIE_SAMESITE_INVALID' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ FRONTEND_ORIGIN: 'http://store.example.test' })),
    { code: 'PRODUCTION_FRONTEND_ORIGIN_INVALID' }
  );
  assert.throws(
    () => validateCoreEnvironment(productionEnvironment({ CORS_ALLOWED_ORIGINS: 'https://admin.example.test/path' })),
    { code: 'PRODUCTION_CORS_ORIGINS_INVALID' }
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

test('database TLS override does not bypass required production settings', () => {
  for (const name of ['JWT_SECRET', 'SESSION_SECRET', 'CSRF_SECRET', 'TWO_FACTOR_ENCRYPTION_KEY',
    'DATABASE_URL', 'FRONTEND_ORIGIN', 'SESSION_STORE', 'COOKIE_SECURE', 'COOKIE_SAME_SITE']) {
    assert.throws(() => validateCoreEnvironment(productionEnvironment({ DB_SSL_MODE: 'no-verify', [name]: '' })));
  }
  const result = validateCoreEnvironment(productionEnvironment({ DB_SSL_MODE: 'no-verify' }));
  assert.equal(result.isProduction, true);
  assert.equal(JSON.stringify(result).includes('unitpassword'), false);
});
