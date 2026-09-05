import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/phone_test';
process.env.SESSION_SECRET = 'unit-phone-hmac-secret';
process.env.PHONE_VERIFICATION_ENABLED = 'true';
process.env.PHONE_VERIFICATION_PROVIDER = 'semaphore';
process.env.SEMAPHORE_API_KEY = 'unit-api-key';
const { default: pool } = await import('../config/database.js');
const { default: router } = await import('./phoneVerification.js');
const { hashPhoneCode } = await import('../services/phoneOtp.js');
const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack[0].handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
afterEach(() => mock.restoreAll());
after(() => pool.end());

const fixture = (overrides = {}) => {
  const record = { phone: '+639123456789', code_hash: hashPhoneCode(1, '+639123456789', '123456'),
    expires_at: new Date(Date.now() + 300000), delivery_accepted: true, attempts: 0,
    send_count: 0, window_started_at: new Date(), ...overrides };
  let phone = '09123456789';
  const client = { release() {}, async query(sql, params) {
    if (sql.startsWith('SELECT phone FROM users')) return { rows: [{ phone }] };
    if (sql.startsWith('SELECT * FROM phone_verifications')) return { rows: [record] };
    if (sql.includes('SET attempts=attempts+1')) {
      record.attempts++;
      if (params[1]) { record.code_hash = null; record.verified_at = new Date(); }
    }
    if (sql.includes('SET phone=$2')) {
      record.code_hash = params[2]; record.last_sent_at = new Date(); record.send_count++; record.delivery_accepted = false;
    }
    return { rows: [], rowCount: 1 };
  } };
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));
  return { record, changePhone: () => { phone = '09987654321'; } };
};
const call = async (path, code = '123456') => {
  const res = response();
  await handler(path)({ user: { id: 1 }, body: { code } }, res, (error) => { throw error; });
  return res;
};

test('phone code is consumed once and rejects changed phone, expiry and exhausted attempts', async () => {
  const { record, changePhone } = fixture();
  assert.equal((await call('/verify')).body.verified, true);
  assert.equal((await call('/verify')).statusCode, 400);
  record.code_hash = hashPhoneCode(1, record.phone, '123456');
  record.attempts = 5;
  assert.equal((await call('/verify')).statusCode, 400);
  record.attempts = 0; record.expires_at = new Date(0);
  assert.equal((await call('/verify')).statusCode, 400);
  record.expires_at = new Date(Date.now() + 300000); changePhone();
  assert.equal((await call('/verify')).statusCode, 400);
});
test('incorrect phone codes consume the attempt budget without verifying', async () => {
  const { record } = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await call('/verify', '000000')).statusCode, 400);
  assert.equal(record.attempts, 5);
  assert.equal(record.verified_at, undefined);
  assert.equal((await call('/verify')).statusCode, 400);
});
test('SMS cooldown and daily quota prevent provider calls; provider failures never expose codes', async () => {
  const { record } = fixture({ last_sent_at: new Date() });
  const send = mock.method(globalThis, 'fetch', async () => { throw new Error('private provider failure'); });
  assert.equal((await call('/send')).statusCode, 429);
  record.last_sent_at = null; record.send_count = 5;
  assert.equal((await call('/send')).statusCode, 429);
  assert.equal(send.mock.callCount(), 0);
  record.send_count = 0;
  const res = await call('/send');
  assert.equal(res.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /private|code_hash|123456|apikey/);
  assert.equal(record.send_count, 1);
  assert.equal((await call('/send')).statusCode, 429);
});
