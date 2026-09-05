import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { validateDeploymentUrls } from './deployment.js';
import { verifyPaymongoWebhookSignature } from '../services/paymongo.js';
import databaseConfig from './databaseConfig.cjs';
import { inspectProductionConfig } from '../../scripts/verify-production-config.js';

const production = {
  NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://store.vercel.app',
  BACKEND_URL: 'https://api.onrender.com',
  GOOGLE_CALLBACK_URL: 'https://api.onrender.com/api/auth/google/callback',
  FACEBOOK_CALLBACK_URL: 'https://api.onrender.com/api/auth/facebook/callback',
  PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_unit', PAYMONGO_PUBLIC_KEY: 'pk_test_unit',
  PAYMONGO_SUCCESS_URL: 'https://store.vercel.app/payment/success',
};
test('production URLs reject local, foreign callbacks, key-mode mismatches and OTP logging', () => {
  assert.doesNotThrow(() => validateDeploymentUrls(production));
  for (const override of [
    { BACKEND_URL: 'https://localhost' }, { BACKEND_URL: 'https://[::1]' },
    { GOOGLE_CALLBACK_URL: 'https://foreign.test/api/auth/google/callback' },
    { PAYMONGO_SUCCESS_URL: 'http://localhost:5173/payment/success' },
    { PAYMONGO_MODE: 'live' }, { OTP_DEBUG_LOG_CODE: 'true' },
  ]) assert.throws(() => validateDeploymentUrls({ ...production, ...override }));
  assert.doesNotThrow(() => validateDeploymentUrls({ NODE_ENV: 'development' }));
});
test('production hosting verifies PayMongo test signatures and rejects live-only signatures in test mode', () => {
  const keys = ['NODE_ENV', 'PAYMONGO_MODE', 'PAYMONGO_WEBHOOK_SECRET'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'production', PAYMONGO_MODE: 'test', PAYMONGO_WEBHOOK_SECRET: 'unit-signature' });
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = Buffer.from('{"data":{}}');
    const digest = crypto.createHmac('sha256', 'unit-signature').update(`${timestamp}.${rawBody}`).digest('hex');
    assert.equal(verifyPaymongoWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},te=${digest}` }), true);
    assert.equal(verifyPaymongoWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},li=${digest}` }), false);
    assert.equal(verifyPaymongoWebhookSignature({ rawBody: Buffer.from('tampered'), signatureHeader: `t=${timestamp},te=${digest}` }), false);
    process.env.PAYMONGO_MODE = 'live';
    assert.equal(verifyPaymongoWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},li=${digest}` }), true);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test('URI sslmode cannot override production certificate verification', () => {
  const config = databaseConfig.createDatabaseConfig({ env: {
    NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:unitpassword@db.example.test/app?sslmode=no-verify',
  } });
  assert.equal(config.pgPoolConfig.ssl.rejectUnauthorized, true);
  assert.equal(new URL(config.pgPoolConfig.connectionString).searchParams.has('sslmode'), false);
  assert.equal(config.knexConnectionConfig.connectionString, config.pgPoolConfig.connectionString);
});

test('production verifier accepts complete deployment settings and reports names, never secret values', () => {
  const env = {
    ...production, FRONTEND_URL: production.FRONTEND_ORIGIN,
    DATABASE_URL: 'postgresql://app:unitpassword@db.example.test/app',
    SESSION_STORE: 'postgres', COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'none',
    GOOGLE_CLIENT_ID: 'unit-client', GOOGLE_CLIENT_SECRET: 'unit-google',
    FACEBOOK_APP_ID: 'unit-app', FACEBOOK_APP_SECRET: 'unit-facebook',
    PAYMENT_PROVIDER: 'paymongo', PAYMONGO_WEBHOOK_SECRET: 'unit-webhook',
    PAYMONGO_FAILED_URL: 'https://store.vercel.app/payment/failed',
    PAYMONGO_CANCEL_URL: 'https://store.vercel.app/payment/cancelled',
    PAYMONGO_ALLOWED_METHODS: 'gcash', PAYMONGO_CURRENCY: 'PHP',
    SHIPPING_PROVIDER: 'internal', SHIPPING_FEE_PROVIDER: 'internal', COURIER_PROVIDER: 'jnt',
    WAYBILL_PROVIDER: 'manual', TRACKING_PROVIDER: 'manual',
    PHONE_VERIFICATION_PROVIDER: 'semaphore', PHONE_VERIFICATION_ENABLED: 'true',
    SEMAPHORE_API_KEY: 'unit-sms', SEMAPHORE_SENDER_NAME: '10THWEST',
    CLOUDINARY_CLOUD_NAME: 'unit-cloud', CLOUDINARY_API_KEY: 'unit-key', CLOUDINARY_API_SECRET: 'unit-media',
    SMTP_HOST: 'mail.example.test', SMTP_USER: 'unit-mail', SMTP_PASS: 'unit-mail-pass', EMAIL_FROM: 'store@example.test',
  };
  for (const key of ['JWT_SECRET', 'SESSION_SECRET', 'CSRF_SECRET', 'TWO_FACTOR_ENCRYPTION_KEY']) {
    env[key] = crypto.randomBytes(32).toString('hex');
  }
  assert.deepEqual(inspectProductionConfig(env), { ready: true, failures: [] });
  for (const override of [{ COOKIE_SECURE: 'false' }, { SESSION_STORE: 'memory' },
    { FACEBOOK_APP_SECRET: '' }, { SEMAPHORE_API_KEY: '' }, { OTP_MAX_ATTEMPTS: '100' },
    { BACKEND_URL: 'http://localhost:5000' }]) {
    const result = inspectProductionConfig({ ...env, ...override });
    assert.equal(result.ready, false);
    for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'FACEBOOK_APP_SECRET', 'SEMAPHORE_API_KEY']) {
      assert.equal(JSON.stringify(result).includes(env[key]), false);
    }
  }
});
