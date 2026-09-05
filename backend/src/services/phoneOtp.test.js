import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPhone, phoneOtpConfig, sendSemaphoreCode } from './phoneOtp.js';

test('SMS readiness and limits fail closed and normalize only Philippine mobile numbers', () => {
  assert.equal(phoneOtpConfig({}).available, false);
  assert.equal(phoneOtpConfig({ PHONE_VERIFICATION_ENABLED: 'true', PHONE_VERIFICATION_PROVIDER: 'semaphore', SEMAPHORE_API_KEY: 'unit', SESSION_SECRET: 'unit' }).available, true);
  assert.throws(() => phoneOtpConfig({ OTP_MAX_ATTEMPTS: '1000' }));
  assert.throws(() => phoneOtpConfig({ OTP_RESEND_COOLDOWN_SECONDS: '1' }));
  assert.equal(canonicalPhone('09123456789'), '+639123456789');
  assert.equal(canonicalPhone('+63 912 345 6789'), '+639123456789');
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
