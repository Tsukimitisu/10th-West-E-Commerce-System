import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymongoGcashCheckout, getPaymongoConfigurationStatus } from './paymongo.js';

test('PayMongo reports missing configuration without creating fake checkout success', async () => {
  const previous = {
    publicKey: process.env.PAYMONGO_PUBLIC_KEY,
    secretKey: process.env.PAYMONGO_SECRET_KEY,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
  };
  delete process.env.PAYMONGO_PUBLIC_KEY;
  delete process.env.PAYMONGO_SECRET_KEY;
  delete process.env.PAYMONGO_WEBHOOK_SECRET;

  try {
    const status = getPaymongoConfigurationStatus();
    assert.equal(status.configured, false);
    assert.deepEqual(status.missing.sort(), ['PAYMONGO_PUBLIC_KEY', 'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET'].sort());
    await assert.rejects(
      () => createPaymongoGcashCheckout({ order: { id: 1, total_amount: 100 }, items: [{ product_price: 100, quantity: 1 }] }),
      (error) => error?.code === 'PAYMONGO_NOT_CONFIGURED',
    );
  } finally {
    if (previous.publicKey === undefined) delete process.env.PAYMONGO_PUBLIC_KEY;
    else process.env.PAYMONGO_PUBLIC_KEY = previous.publicKey;
    if (previous.secretKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = previous.secretKey;
    if (previous.webhookSecret === undefined) delete process.env.PAYMONGO_WEBHOOK_SECRET;
    else process.env.PAYMONGO_WEBHOOK_SECRET = previous.webhookSecret;
  }
});

test('PayMongo checkout uses configured redirect URLs', async () => {
  const previousEnv = {
    publicKey: process.env.PAYMONGO_PUBLIC_KEY,
    secretKey: process.env.PAYMONGO_SECRET_KEY,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    success: process.env.PAYMONGO_SUCCESS_URL,
    cancel: process.env.PAYMONGO_CANCEL_URL,
    failed: process.env.PAYMONGO_FAILED_URL,
  };
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.PAYMONGO_PUBLIC_KEY = 'pk_test_unit';
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_unit';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_unit';
  process.env.PAYMONGO_SUCCESS_URL = 'https://shop.test/payments/success/{orderId}';
  process.env.PAYMONGO_CANCEL_URL = 'https://shop.test/payments/cancel/{orderId}';
  process.env.PAYMONGO_FAILED_URL = 'https://shop.test/payments/failed/{orderId}';
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: {
          id: 'cs_test_123',
          attributes: { checkout_url: 'https://paymongo.test/checkout' },
        },
      }),
    };
  };

  try {
    const checkout = await createPaymongoGcashCheckout({
      order: { id: 77, payment_id: 12, total_amount: 250 },
      items: [{ product_name: 'Oil', product_price: 250, quantity: 1 }],
    });
    assert.equal(checkout.id, 'cs_test_123');
    const attrs = requestBody.data.attributes;
    assert.equal(attrs.success_url, 'https://shop.test/payments/success/77');
    assert.equal(attrs.cancel_url, 'https://shop.test/payments/cancel/77');
    assert.equal(attrs.metadata.failed_url, 'https://shop.test/payments/failed/77');
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      PAYMONGO_PUBLIC_KEY: previousEnv.publicKey,
      PAYMONGO_SECRET_KEY: previousEnv.secretKey,
      PAYMONGO_WEBHOOK_SECRET: previousEnv.webhookSecret,
      PAYMONGO_SUCCESS_URL: previousEnv.success,
      PAYMONGO_CANCEL_URL: previousEnv.cancel,
      PAYMONGO_FAILED_URL: previousEnv.failed,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
