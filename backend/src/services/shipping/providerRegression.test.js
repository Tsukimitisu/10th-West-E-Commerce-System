import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import bigsellerProvider from './providers/bigsellerProvider.js';
import mockProvider from './providers/mockShippingProvider.js';
import { normalizeStatus } from './providers/providerUtils.js';
import { publicProviderError } from './providerError.js';
import aftershipProvider from '../tracking/providers/aftershipProvider.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const backendSource = path.resolve(directory, '..', '..');

const ENV_NAMES = [
  'NODE_ENV',
  'BIGSELLER_API_BASE_URL',
  'BIGSELLER_APP_KEY',
  'BIGSELLER_APP_SECRET',
  'BIGSELLER_ACCESS_TOKEN',
  'BIGSELLER_WEBHOOK_SECRET',
  'BIGSELLER_WAREHOUSE_ID',
  'BIGSELLER_JT_PH_VIP_CODE',
  'SHIPPER_NAME',
  'SHIPPER_PHONE',
  'SHIPPER_ADDRESS_LINE1',
  'SHIPPER_CITY',
  'SHIPPER_POSTAL_CODE',
  'SHIPPING_COUNTRY',
  'SHIPPING_CARRIER',
  'AFTERSHIP_API_KEY',
  'AFTERSHIP_WEBHOOK_SECRET',
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

test('active shipping routes contain no direct courier integration calls', async () => {
  const files = [
    path.join(backendSource, 'routes', 'shipments.js'),
    path.join(backendSource, 'routes', 'waybills.js'),
    path.join(backendSource, 'controllers', 'shipmentController.js'),
    path.join(directory, 'shippingService.js'),
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /JNT_|jntShipments|createJnt|refreshJnt|JNT_MOCK_MODE/i);
  }
});

test('BigSeller never produces success without a mapped official contract', async () => {
  await withEnvironment({}, async () => {
    await assert.rejects(
      () => bigsellerProvider.createShipment({ order: { id: 1 } }),
      (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.status === 503
    );
  });
  await withEnvironment({
    BIGSELLER_API_BASE_URL: 'https://provider.invalid',
    BIGSELLER_APP_KEY: 'test',
    BIGSELLER_APP_SECRET: 'test',
    BIGSELLER_ACCESS_TOKEN: 'test',
    BIGSELLER_WEBHOOK_SECRET: 'test',
    BIGSELLER_WAREHOUSE_ID: 'test',
    BIGSELLER_JT_PH_VIP_CODE: 'test',
    SHIPPER_NAME: 'Test',
    SHIPPER_PHONE: '09170000000',
    SHIPPER_ADDRESS_LINE1: 'Test',
    SHIPPER_CITY: 'Test',
    SHIPPER_POSTAL_CODE: '1000',
    SHIPPING_COUNTRY: 'PH',
    SHIPPING_CARRIER: 'jtexpress-ph',
  }, async () => {
    await assert.rejects(
      () => bigsellerProvider.generateWaybill({ order: { id: 1 } }),
      (error) => error.code === 'PROVIDER_NOT_IMPLEMENTED' && error.status === 501
    );
  });
});

test('missing AfterShip credentials fail without network or tracking success', async () => {
  await withEnvironment({}, async () => {
    await assert.rejects(
      () => aftershipProvider.registerTracking({ trackingNumber: 'NOT-SENT' }),
      (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.status === 503
    );
  });
});

test('mock stays blocked in production and errors stay explicitly unsuccessful', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => mockProvider.createShipment({ order: { id: 1 } }),
      (error) => error.code === 'MOCK_PROVIDER_BLOCKED'
    );
  });
  assert.equal(publicProviderError(new Error('database detail')).success, false);
});

test('returned events and customer serialization remain safe', async () => {
  assert.equal(normalizeStatus('Exception', 'Exception_011'), 'returned');
  const orderController = await readFile(path.join(backendSource, 'controllers', 'orderController.js'), 'utf8');
  const mapper = orderController.slice(
    orderController.indexOf('const mapOrderRecord'),
    orderController.indexOf('const getMemoryOrderBundle')
  );
  assert.doesNotMatch(mapper, /courier_metadata|waybill_label_payload/);
});

test('Super Admin readiness uses the schema-safe operational helper', async () => {
  const adminRoutes = await readFile(path.join(backendSource, 'routes', 'admin.js'), 'utf8');
  assert.match(adminRoutes, /getShippingOperationalReadiness\(pool\)/);
  assert.doesNotMatch(adminRoutes, /MAX\(last_tracking_refresh_at\)/);
});
