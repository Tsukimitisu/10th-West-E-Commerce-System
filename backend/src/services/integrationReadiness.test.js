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
  'COURIER_PROVIDER',
  'WAYBILL_PROVIDER',
  'JNT_COURIER_NAME',
  'SHIPPING_COVERAGE',
  'DISTANCE_PROVIDER',
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
  shipping: { provider: 'internal', ready: true, status: 'configured' },
  tracking: { provider: 'external_link', ready: true, status: 'available_after_waybill' },
};

test('public integration readiness reports internal and manual J&T logistics without secrets', async () => {
  await withEnvironment({}, async () => {
    const readiness = buildPublicIntegrationReadiness(sampleProviders);
    assert.deepEqual(readiness, {
      payment: 'blocked_by_credentials',
      shipping: {
        provider: 'internal',
        type: 'luzon_location_weight_distance_based',
        coverage: 'luzon_only',
        distance_provider: 'internal',
        status: 'configured',
      },
      courier: {
        provider: 'jnt',
        courier_name: 'J&T Express',
        status: 'configured',
      },
      waybill: {
        provider: 'manual',
        status: 'manual_enabled',
      },
      tracking: { provider: 'external_link', status: 'available_after_waybill' },
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
    assert.equal(readiness.shipping.provider, 'internal');
    assert.equal(readiness.waybill.status, 'manual_enabled');
    assert.equal(readiness.shipping.type, 'luzon_location_weight_distance_based');
    assert.equal(readiness.shipping.coverage, 'luzon_only');
    assert.equal(readiness.shipping.distance_provider, 'internal');
    assert.equal(readiness.courier.status, 'configured');
    assert.equal(readiness.tracking.status, 'available_after_waybill');
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
