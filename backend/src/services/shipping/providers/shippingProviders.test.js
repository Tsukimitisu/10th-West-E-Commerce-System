import assert from 'node:assert/strict';
import test from 'node:test';
import bigsellerProvider, { BIGSELLER_CONTRACT_REQUIREMENTS } from './bigsellerProvider.js';
import mockProvider from './mockShippingProvider.js';
import { getShippingProvider } from './index.js';

const ENV_NAMES = [
  'NODE_ENV',
  'BIGSELLER_API_BASE_URL',
  'BIGSELLER_APP_KEY',
  'BIGSELLER_APP_SECRET',
  'BIGSELLER_ACCESS_TOKEN',
  'BIGSELLER_WEBHOOK_SECRET',
  'BIGSELLER_WAREHOUSE_ID',
  'BIGSELLER_JT_PH_VIP_CODE',
  'SHIPPING_COUNTRY',
  'SHIPPING_CARRIER',
  'SHIPPER_NAME',
  'SHIPPER_PHONE',
  'SHIPPER_ADDRESS_LINE1',
  'SHIPPER_CITY',
  'SHIPPER_POSTAL_CODE',
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

test('BigSeller distinguishes missing credentials from an unavailable private contract', async () => {
  await withEnvironment({ NODE_ENV: 'test' }, async () => {
    await assert.rejects(
      () => bigsellerProvider.calculateRates({}),
      (error) => error.code === 'PROVIDER_NOT_CONFIGURED'
    );
  });
  await withEnvironment({
    NODE_ENV: 'test',
    BIGSELLER_API_BASE_URL: 'https://provider.invalid',
    BIGSELLER_APP_KEY: 'test-key',
    BIGSELLER_APP_SECRET: 'test-secret',
    BIGSELLER_ACCESS_TOKEN: 'test-token',
    BIGSELLER_WEBHOOK_SECRET: 'test-webhook',
    BIGSELLER_WAREHOUSE_ID: 'warehouse-1',
    BIGSELLER_JT_PH_VIP_CODE: 'MNL-V0123',
    SHIPPING_COUNTRY: 'PH',
    SHIPPING_CARRIER: 'jtexpress-ph',
    SHIPPER_NAME: 'Test Store',
    SHIPPER_PHONE: '09170000000',
    SHIPPER_ADDRESS_LINE1: 'Test address',
    SHIPPER_CITY: 'Quezon City',
    SHIPPER_POSTAL_CODE: '1100',
  }, async () => {
    await assert.rejects(
      () => bigsellerProvider.calculateRates({}),
      (error) => error.code === 'PROVIDER_NOT_IMPLEMENTED'
    );
  });
});

test('BigSeller configuration rejects routes outside its verified Philippine carrier path', async () => {
  await withEnvironment({
    NODE_ENV: 'test',
    BIGSELLER_API_BASE_URL: 'https://provider.invalid',
    BIGSELLER_APP_KEY: 'test-key',
    BIGSELLER_APP_SECRET: 'test-secret',
    BIGSELLER_ACCESS_TOKEN: 'test-token',
    BIGSELLER_WEBHOOK_SECRET: 'test-webhook',
    BIGSELLER_WAREHOUSE_ID: 'warehouse-1',
    BIGSELLER_JT_PH_VIP_CODE: 'MNL-V0123',
    SHIPPING_COUNTRY: 'SG',
    SHIPPING_CARRIER: 'jtexpress-ph',
    SHIPPER_NAME: 'Test Store',
    SHIPPER_PHONE: '09170000000',
    SHIPPER_ADDRESS_LINE1: 'Test address',
    SHIPPER_CITY: 'Quezon City',
    SHIPPER_POSTAL_CODE: '1100',
  }, async () => {
    const status = bigsellerProvider.getConfigurationStatus();
    assert.equal(status.supportedRoute, false);
    assert.equal(status.configured, false);
    assert.equal(status.status, 'unsupported_market_or_carrier');
  });
});

test('BigSeller publishes contract requirements without inventing provider operations', () => {
  assert.deepEqual(BIGSELLER_CONTRACT_REQUIREMENTS, [
    'api_base_url',
    'app_key',
    'app_secret',
    'access_token',
    'warehouse_id',
    'jtexpress_ph_logistics_channel_code',
    'create_shipment_or_fulfillment_endpoint',
    'waybill_or_label_endpoint',
    'tracking_endpoint_if_supported',
    'webhook_signature_method',
  ]);
  const status = bigsellerProvider.getConfigurationStatus();
  assert.equal(status.implemented, false);
  assert.equal(status.implementationNeeded, true);
});

test('development mock returns explicitly simulated records', async () => {
  await withEnvironment({ NODE_ENV: 'development' }, async () => {
    const shipment = await mockProvider.createShipment({ order: { id: 42 } });
    const waybill = await mockProvider.generateWaybill({
      order: { id: 42 },
      shipment: { tracking_number: shipment.trackingNumber },
    });
    assert.equal(shipment.simulated, true);
    assert.match(shipment.trackingNumber, /^MOCK-TRACK-/);
    assert.equal(waybill.labelPayload.simulated, true);
    assert.match(waybill.labelPayload.warning, /not valid/i);
  });
});

test('mock shipping is blocked in production', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => mockProvider.createShipment({ order: { id: 42 } }),
      (error) => error.code === 'MOCK_PROVIDER_BLOCKED' && error.status === 503
    );
  });
});

test('unknown shipping provider is rejected', () => {
  assert.throws(
    () => getShippingProvider('unknown'),
    (error) => error.code === 'UNSUPPORTED_SHIPPING_PROVIDER' && error.status === 503
  );
});

test('every selectable shipping provider declares Philippine carrier support', () => {
  for (const provider of [bigsellerProvider, mockProvider]) {
    const status = provider.getConfigurationStatus();
    assert.ok(status.markets.includes('PH'));
    assert.ok(status.carriers.includes('jtexpress-ph'));
  }
  assert.throws(
    () => getShippingProvider('payrecon'),
    (error) => error.code === 'UNSUPPORTED_SHIPPING_PROVIDER'
  );
});
