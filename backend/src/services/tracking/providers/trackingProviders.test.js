import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import aftershipProvider from './aftershipProvider.js';
import trackingMoreProvider from './trackingmoreProvider.js';

const ENV_NAMES = [
  'AFTERSHIP_API_KEY',
  'AFTERSHIP_WEBHOOK_SECRET',
  'TRACKINGMORE_API_KEY',
  'TRACKINGMORE_WEBHOOK_SECRET',
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

test('AfterShip webhook validates HMAC and returns normalized events', async () => {
  await withEnvironment({
    AFTERSHIP_API_KEY: 'test-key',
    AFTERSHIP_WEBHOOK_SECRET: 'test-webhook-secret',
  }, async () => {
    const body = {
      msg: {
        id: 'tracking-id',
        tracking_number: 'TRACK-42',
        tag: 'InTransit',
        checkpoints: [{
          id: 'checkpoint-1',
          tag: 'InTransit',
          message: 'Parcel departed',
          checkpoint_time: '2026-06-30T08:00:00.000Z',
        }],
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(rawBody)
      .digest('base64');
    const result = await aftershipProvider.handleWebhook({
      rawBody,
      body,
      headers: { 'aftership-hmac-sha256': signature },
    });
    assert.equal(result.tracking.normalizedStatus, 'in_transit');
    assert.equal(result.events[0].eventId, 'checkpoint-1');
  });
});

test('AfterShip webhook rejects invalid signatures', async () => {
  await withEnvironment({
    AFTERSHIP_API_KEY: 'test-key',
    AFTERSHIP_WEBHOOK_SECRET: 'test-webhook-secret',
  }, async () => {
    await assert.rejects(
      () => aftershipProvider.handleWebhook({
        rawBody: Buffer.from('{}'),
        body: {},
        headers: { 'aftership-hmac-sha256': 'invalid' },
      }),
      (error) => error.code === 'INVALID_WEBHOOK_SIGNATURE' && error.status === 401
    );
  });
});

test('TrackingMore remains a safe shell without credentials or an assumed contract', async () => {
  await withEnvironment({}, async () => {
    await assert.rejects(
      () => trackingMoreProvider.getTrackingStatus({ trackingNumber: 'TRACK-42' }),
      (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.status === 503
    );
  });
  await withEnvironment({
    TRACKINGMORE_API_KEY: 'test-key',
    TRACKINGMORE_WEBHOOK_SECRET: 'test-secret',
  }, async () => {
    await assert.rejects(
      () => trackingMoreProvider.getTrackingStatus({ trackingNumber: 'TRACK-42' }),
      (error) => error.code === 'PROVIDER_NOT_IMPLEMENTED' && error.status === 501
    );
  });
});
