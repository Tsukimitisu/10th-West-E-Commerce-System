import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { validateDeploymentUrls } from './deployment.js';
import { verifyPaymongoWebhookSignature } from '../services/paymongo.js';
import databaseConfig from './databaseConfig.cjs';
import { inspectProductionConfig, inspectProductionEmailConfig } from '../../scripts/verify-production-config.js';

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
test('URI sslmode cannot override the explicitly selected database TLS policy', () => {
  const config = databaseConfig.createDatabaseConfig({ env: {
    NODE_ENV: 'production', DB_SSL_MODE: 'verify-full', DATABASE_URL: 'postgresql://app:unitpassword@db.example.test/app?sslmode=no-verify',
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
    EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_unit_secret', RESEND_FROM: '10th West Moto <noreply@verified.example.test>',
  };
  for (const key of ['JWT_SECRET', 'SESSION_SECRET', 'CSRF_SECRET', 'TWO_FACTOR_ENCRYPTION_KEY']) {
    env[key] = crypto.randomBytes(32).toString('hex');
  }
  assert.deepEqual(inspectProductionConfig(env), { ready: true, failures: [] });
  assert.deepEqual(inspectProductionConfig({ ...env, DB_SSL_MODE: 'no-verify' }), { ready: true, failures: [] });
  assert.deepEqual(inspectProductionConfig({ ...env, DB_SSL_REJECT_UNAUTHORIZED: 'false' }), { ready: true, failures: [] });
  assert.equal(inspectProductionConfig({ ...env, DB_SSL_MODE: 'disable' }).ready, false);
  for (const override of [{ COOKIE_SECURE: 'false' }, { SESSION_STORE: 'memory' },
    { FACEBOOK_APP_SECRET: '' }, { SEMAPHORE_API_KEY: '' }, { OTP_MAX_ATTEMPTS: '100' },
    { BACKEND_URL: 'http://localhost:5000' }]) {
    const result = inspectProductionConfig({ ...env, ...override });
    assert.equal(result.ready, false);
    for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'FACEBOOK_APP_SECRET', 'SEMAPHORE_API_KEY']) {
      assert.equal(JSON.stringify(result).includes(env[key]), false);
    }
  }
  const textbee = { ...env, PHONE_VERIFICATION_PROVIDER: 'textbee', TEXTBEE_API_KEY: 'txb_unit_verifier_secret', SEMAPHORE_API_KEY: '', SEMAPHORE_SENDER_NAME: '' };
  assert.deepEqual(inspectProductionConfig(textbee), { ready: true, failures: [] }, 'TextBee does not require Semaphore credentials');
  assert.ok(inspectProductionConfig({ ...textbee, TEXTBEE_API_KEY: 'YOUR_TEXTBEE_KEY' }).failures.includes('TEXTBEE_API_KEY missing or placeholder'));
  for (const override of [{ TEXTBEE_API_KEY: '' }, { PHONE_VERIFICATION_PROVIDER: 'unknown' }]) {
    const result = inspectProductionConfig({ ...textbee, ...override });
    assert.equal(result.ready, false);
    assert.ok(result.failures.includes('Phone verification provider or OTP limits invalid'));
    assert.equal(JSON.stringify(result).includes('txb_unit_verifier_secret'), false);
  }
  assert.ok(inspectProductionConfig({ ...textbee, TEXTBEE_API_KEY: '' }).failures.includes('TEXTBEE_API_KEY missing or placeholder'));
  const semaphoreMissing = inspectProductionConfig({ ...env, SEMAPHORE_SENDER_NAME: '' });
  assert.ok(semaphoreMissing.failures.includes('SEMAPHORE_SENDER_NAME missing or placeholder'), 'Semaphore checks retained');
});


test('email-only production diagnostic rejects test senders, missing secrets and unsafe links without printing values', () => {
  const env = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_private_diagnostic_key', RESEND_FROM: '10th West <noreply@verified.example.test>', FRONTEND_ORIGIN: 'https://10th-west-e-commerce-system.vercel.app', EMAIL_PROVIDER_TIMEOUT_MS: '15000' };
  assert.deepEqual(inspectProductionEmailConfig(env), { ready: true, failures: [] });
  for (const override of [
    { RESEND_FROM: '10th West <onboarding@resend.dev>' }, { RESEND_FROM: 'invalid' },
    { RESEND_API_KEY: '' }, { RESEND_API_KEY: 'YOUR_RESEND_API_KEY' }, { EMAIL_PROVIDER: '' },
    { FRONTEND_ORIGIN: 'http://localhost:5173' }, { FRONTEND_ORIGIN: 'https://127.0.0.1' },
    { FRONTEND_ORIGIN: '' }, { EMAIL_PROVIDER_TIMEOUT_MS: '-1' }, { EMAIL_PROVIDER_TIMEOUT_MS: 'forever' },
  ]) {
    const result = inspectProductionEmailConfig({ ...env, ...override });
    assert.equal(result.ready, false);
    assert.doesNotMatch(JSON.stringify(result), /re_private_diagnostic_key|noreply@verified/);
  }
  assert.equal(inspectProductionEmailConfig({ ...env, FRONTEND_ORIGIN: '', FRONTEND_URL: env.FRONTEND_ORIGIN }).ready, true);
});


test('invalid webhook tolerance cannot disable signed-event age validation', () => {
  const names = ['PAYMONGO_WEBHOOK_SECRET', 'PAYMONGO_WEBHOOK_TOLERANCE_SECONDS'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.PAYMONGO_WEBHOOK_SECRET = 'isolated-webhook-key';
    const timestamp = Math.floor(Date.now() / 1000) - 3600;
    const rawBody = Buffer.from('{"data":{}}');
    const digest = crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
    for (const value of ['invalid', 'Infinity', '99999999']) {
      process.env.PAYMONGO_WEBHOOK_TOLERANCE_SECONDS = value;
      assert.equal(verifyPaymongoWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},te=${digest}` }), false);
    }
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});


test('enabled automatic backups require valid schedule, encryption and private-storage configuration', () => {
  const result = inspectProductionConfig({ NODE_ENV: 'production', BACKUP_ENABLED: 'true', BACKUP_CRON: 'invalid', BACKUP_RETENTION_DAYS: '-1' });
  assert.equal(result.ready, false);
  for (const failure of ['Backup schedule or retention invalid', 'BACKUP_ENCRYPTION_KEY missing or invalid', 'Private backup storage configuration missing or invalid']) assert.ok(result.failures.includes(failure));
});
