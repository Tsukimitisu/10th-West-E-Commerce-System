import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminIntegrationReadiness,
  buildPublicIntegrationReadiness,
  getEmailConfigurationStatus,
  selectedIntegrationsReady,
} from './integrationReadiness.js';

const ENV_NAMES = [
  'EMAIL_PROVIDER',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'TRACKING_PROVIDER',
];

const withEnvironment = async (values, callback) => {
  const original = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, values);
  try {
    await callback();
  } finally {
    for (const name of ENV_NAMES) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
};

const sampleProviders = {
  paymongo: { configured: false, mode: 'test' },
  shipping: { provider: 'bigseller', ready: false, status: 'blocked_by_credentials' },
  tracking: { provider: 'aftership', ready: false, status: 'blocked_by_credentials' },
};

test('public integration readiness reports blocked categories without secret names', async () => {
  await withEnvironment({}, async () => {
    const readiness = buildPublicIntegrationReadiness(sampleProviders);
    assert.deepEqual(readiness, {
      payment: 'blocked_by_credentials',
      shipping: 'blocked_by_credentials',
      tracking: 'blocked_by_credentials',
      email: 'blocked_by_credentials',
      media: 'blocked_by_credentials',
    });
    assert.doesNotMatch(JSON.stringify(readiness), /SECRET|PASSWORD|TOKEN|API_KEY|SMTP_PASS/i);
  });
});

test('admin integration readiness exposes categories but not secret variable names', async () => {
  await withEnvironment({ EMAIL_PROVIDER: 'gmail' }, async () => {
    const readiness = buildAdminIntegrationReadiness(sampleProviders);
    assert.equal(readiness.email.status, 'blocked_by_credentials');
    assert.deepEqual(readiness.email.missing_categories, ['host', 'port', 'username', 'password']);
    assert.equal(readiness.payrecon.status, 'implementation_needed');
    assert.equal(readiness.trackingmore.status, 'not_selected');
    assert.doesNotMatch(JSON.stringify(readiness), /PAYMONGO_SECRET_KEY|SMTP_PASS|CLOUDINARY_API_SECRET|FACEBOOK_APP_SECRET/);
  });
});

test('configured SMTP aliases make email readiness explicit', async () => {
  await withEnvironment({
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.test.local',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer@test.local',
    SMTP_PASS: 'unit-secret',
  }, async () => {
    const status = getEmailConfigurationStatus();
    assert.equal(status.ready, true);
    assert.equal(status.status, 'configured');
    assert.equal(status.transport.host, 'smtp.test.local');
  });
});

test('not-selected provider shells do not block selected readiness aggregation', () => {
  assert.equal(selectedIntegrationsReady({
    payment: { selected: true, ready: true, status: 'configured' },
    payrecon: { selected: false, ready: false, status: 'implementation_needed' },
    trackingmore: { selected: false, ready: false, status: 'not_selected' },
  }), true);
  assert.equal(selectedIntegrationsReady({
    payment: { selected: true, ready: false, status: 'blocked_by_credentials' },
  }), false);
});
