import assert from 'node:assert/strict';
import test from 'node:test';
import bigsellerProvider from './bigsellerProvider.js';
import mockProvider from './mockShippingProvider.js';
import payreconProvider from './payreconProvider.js';
import { getShippingProvider } from './index.js';

const ENV_NAMES = [
  'NODE_ENV',
  'PAYRECON_API_BASE_URL',
  'PAYRECON_API_KEY',
  'PAYRECON_API_SECRET',
  'PAYRECON_WEBHOOK_SECRET',
  'PAYRECON_ACCOUNT_ID',
  'BIGSELLER_API_BASE_URL',
  'BIGSELLER_APP_KEY',
  'BIGSELLER_APP_SECRET',
  'BIGSELLER_ACCESS_TOKEN',
  'BIGSELLER_WEBHOOK_SECRET',
  'BIGSELLER_WAREHOUSE_ID',
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

test('PayRecon reports missing credentials without fabricating a booking', async () => {
  await withEnvironment({ NODE_ENV: 'test' }, async () => {
    await assert.rejects(
      () => payreconProvider.createShipment({ order: { id: 42 } }),
      (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.status === 503
    );
  });
});

test('PayRecon fails as not implemented when credentials exist but no verified contract exists', async () => {
  await withEnvironment({
    NODE_ENV: 'test',
    PAYRECON_API_BASE_URL: 'https://provider.invalid',
    PAYRECON_API_KEY: 'test-key',
    PAYRECON_API_SECRET: 'test-secret',
    PAYRECON_WEBHOOK_SECRET: 'test-webhook',
    PAYRECON_ACCOUNT_ID: 'test-account',
    SHIPPER_NAME: 'Test Store',
    SHIPPER_PHONE: '09170000000',
    SHIPPER_ADDRESS_LINE1: 'Test address',
    SHIPPER_CITY: 'Quezon City',
    SHIPPER_POSTAL_CODE: '1100',
  }, async () => {
    await assert.rejects(
      () => payreconProvider.generateWaybill({ order: { id: 42 } }),
      (error) => error.code === 'PROVIDER_NOT_IMPLEMENTED' && error.status === 501
    );
  });
});

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
