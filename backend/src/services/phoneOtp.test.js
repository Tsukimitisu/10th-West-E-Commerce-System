import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPhone, phoneOtpConfig, sendPhoneVerificationCode, sendSemaphoreCode, sendTextBeeCode } from './phoneOtp.js';

test('SMS readiness and limits fail closed and normalize only Philippine mobile numbers', () => {
  assert.equal(phoneOtpConfig({}).available, false);
  assert.equal(phoneOtpConfig({ PHONE_VERIFICATION_ENABLED: 'true', PHONE_VERIFICATION_PROVIDER: 'semaphore', SEMAPHORE_API_KEY: 'unit', SESSION_SECRET: 'unit' }).available, true);
  assert.throws(() => phoneOtpConfig({ OTP_MAX_ATTEMPTS: '1000' }));
  assert.throws(() => phoneOtpConfig({ OTP_RESEND_COOLDOWN_SECONDS: '1' }));
  assert.equal(canonicalPhone('09123456789'), '+639123456789');
  assert.equal(canonicalPhone('+63 912 345 6789'), '+639123456789');
  assert.equal(canonicalPhone('639123456789'), '+639123456789');
  assert.equal(canonicalPhone('1234'), null);
});
test('Semaphore sends a real API-shaped request and discards the provider OTP response', async () => {
  const result = await sendSemaphoreCode({ phone: '+639123456789', code: '123456', expiry: 5 }, async (url, options) => {
    assert.equal(url, 'https://api.semaphore.co/api/v4/otp');
    assert.equal(options.body.get('number'), '639123456789');
    assert.equal(options.body.get('code'), '123456');
    return { ok: true, json: async () => [{ message_id: 1, status: 'Pending', code: '123456' }] };
  });
  assert.equal(result, undefined);
  await assert.rejects(sendSemaphoreCode({ phone: '+639123456789', code: '123456', expiry: 5 }, async () => ({ ok: false, json: async () => ({ secret: 'private' }) })), /SMS delivery could not be started/);
});

const textbeeEnv = { PHONE_VERIFICATION_ENABLED: 'true', PHONE_VERIFICATION_PROVIDER: 'textbee', TEXTBEE_API_KEY: 'txb_unit_secret_key', SESSION_SECRET: 'unit', TEXTBEE_API_BASE_URL: 'https://api.textbee.dev/api/v1/' };
const input = { phone: '+639123456789', code: '482913', expiry: 5 };
const queued = { ok: true, status: 201, json: async () => ({ data: { success: true, message: 'SMS added to queue for processing', smsBatchId: 'batch-1', recipientCount: 1 } }) };
const failure = /^SMS delivery could not be started/;
const assertSafe = async (promise) => {
  const error = await promise.then(() => null, (caught) => caught);
  assert.ok(error, 'expected a delivery failure');
  assert.match(error.message, failure);
  for (const secret of [textbeeEnv.TEXTBEE_API_KEY, input.code]) assert.equal(`${error.message}${error.stack}`.includes(secret), false);
};

test('TextBee readiness is provider-aware and requires its API key and session secret', () => {
  assert.equal(phoneOtpConfig(textbeeEnv).available, true);
  assert.equal(phoneOtpConfig({ ...textbeeEnv, TEXTBEE_API_KEY: ' ' }).available, false);
  assert.equal(phoneOtpConfig({ ...textbeeEnv, SESSION_SECRET: '' }).available, false);
  assert.equal(phoneOtpConfig({ ...textbeeEnv, PHONE_VERIFICATION_ENABLED: 'false' }).available, false);
  assert.equal(phoneOtpConfig({ ...textbeeEnv, PHONE_VERIFICATION_PROVIDER: 'twilio' }).available, false);
  assert.equal(phoneOtpConfig({ ...textbeeEnv, PHONE_VERIFICATION_PROVIDER: 'semaphore' }).available, false, 'semaphore still needs its own key');
});

test('TextBee queues the OTP to the canonical +639 recipient with the x-api-key header', async () => {
  const calls = [];
  const result = await sendTextBeeCode(input, async (url, options) => { calls.push({ url, options }); return queued; }, textbeeEnv);
  assert.equal(result, undefined, 'nothing (including the OTP) is returned');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['x-api-key'], 'txb_unit_secret_key');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.ok(calls[0].options.signal);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.recipients, ['+639123456789']);
  assert.equal(body.message, 'Your 10th West Moto verification code is 482913. Expires in 5 minutes. Do not share this code.');
});

test('TextBee failures are generic and never leak the key or OTP', async () => {
  const respond = (response) => async () => response;
  await assertSafe(sendTextBeeCode(input, respond(queued), { ...textbeeEnv, TEXTBEE_API_KEY: '' }));
  for (const status of [400, 401, 429, 500]) {
    await assertSafe(sendTextBeeCode(input, respond({ ok: false, status, json: async () => ({ error: `rejected txb_unit_secret_key ${input.code}` }) }), textbeeEnv));
  }
  await assertSafe(sendTextBeeCode(input, respond({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }), textbeeEnv));
  await assertSafe(sendTextBeeCode(input, respond({ ok: true, status: 200, json: async () => ({ data: { success: true, recipientCount: 1 } }) }), textbeeEnv));
  await assertSafe(sendTextBeeCode(input, respond({ ok: true, status: 200, json: async () => ({ data: { success: false, smsBatchId: 'x' } }) }), textbeeEnv));
  await assertSafe(sendTextBeeCode(input, async () => { throw Object.assign(new Error(`timeout txb_unit_secret_key ${input.code}`), { name: 'TimeoutError' }); }, textbeeEnv));
  await assertSafe(sendTextBeeCode({ ...input, phone: '12345' }, respond(queued), textbeeEnv));
});

test('TextBee request is aborted when the configured timeout elapses', async () => {
  const hanging = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assertSafe(sendTextBeeCode(input, hanging, { ...textbeeEnv, TEXTBEE_TIMEOUT_MS: '20' }));
});

test('provider selection routes to TextBee or Semaphore and fails closed otherwise', async () => {
  const urls = [];
  const request = async (url) => { urls.push(String(url)); return String(url).includes('semaphore') ? { ok: true, json: async () => [{ message_id: 9, status: 'Queued' }] } : queued; };
  await sendPhoneVerificationCode(input, request, textbeeEnv);
  const previous = process.env.SEMAPHORE_API_KEY;
  process.env.SEMAPHORE_API_KEY = 'unit-semaphore';
  try {
    await sendPhoneVerificationCode(input, request, { PHONE_VERIFICATION_PROVIDER: 'semaphore' });
  } finally {
    if (previous === undefined) delete process.env.SEMAPHORE_API_KEY; else process.env.SEMAPHORE_API_KEY = previous;
  }
  assert.deepEqual(urls, ['https://api.textbee.dev/api/v1/gateway/send-sms', 'https://api.semaphore.co/api/v4/otp']);
  await assertSafe(sendPhoneVerificationCode(input, request, { PHONE_VERIFICATION_PROVIDER: 'unknown' }));
  assert.equal(urls.length, 2, 'unsupported provider sends nothing');
});
