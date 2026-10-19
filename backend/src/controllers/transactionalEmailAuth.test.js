import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import { Resend } from 'resend';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/email_auth_test';
const { default: pool } = await import('../config/database.js');
const { register, forgotPassword, resendVerification } = await import('./authController.js');
const names = ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_FROM', 'FRONTEND_ORIGIN', 'FRONTEND_URL', 'NODE_ENV'];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
const origin = 'https://10th-west-e-commerce-system.vercel.app';
const email = 'private-rider@gmail.com';
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
beforeEach(() => Object.assign(process.env, {
  EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_private_auth_key', RESEND_FROM: '10th West <noreply@verified.example.test>',
  FRONTEND_ORIGIN: origin, FRONTEND_URL: 'http://localhost:5173',
}));
afterEach(() => {
  mock.restoreAll();
  for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
});
after(() => pool.end().catch(() => {}));

function fixture() {
  const f = { user: { id: 42, name: 'Rider', email, password_hash: 'existing-hash', email_verified: false, email_verification_sent_at: null },
    providerResponse: { data: { id: 'valid-send-id' }, error: null }, queries: [], payloads: [], logs: [] };
  for (const method of ['info', 'warn', 'error']) mock.method(console, method, (...args) => f.logs.push(args));
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.gmail.com' }]);
  mock.method(Resend.prototype, 'post', async (path, payload) => {
    assert.equal(path, '/emails'); f.payloads.push(payload); return f.providerResponse;
  });
  mock.method(pool, 'connect', async () => ({ release() {}, async query(sql, args = []) {
    f.queries.push({ sql: String(sql), args });
    if (sql.includes('INSERT INTO users')) return { rows: [{ id: 42, name: 'Rider', email }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  } }));
  mock.method(pool, 'query', async (sql, args = []) => {
    f.queries.push({ sql: String(sql), args });
    if (sql.includes('FROM system_settings')) return { rows: [] };
    if (sql.includes('FROM users WHERE email') || sql.includes('SELECT id, name, email, email_verified')) return { rows: f.user ? [{ ...f.user }] : [] };
    if (sql.includes('SET email_verification_sent_at = $1')) { f.user.email_verification_sent_at = args[0]; return { rows: [{ id: f.user.id }], rowCount: 1 }; }
    if (/^(?:UPDATE users|INSERT INTO activity_logs)/.test(sql.trim())) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected mocked email query: ${sql}`);
  });
  return f;
}

for (const accepted of [true, false]) {
  test(`registration Resend ${accepted ? 'acceptance' : 'malformed response'} records truthful delivery state and correct production URL`, async () => {
    const f = fixture();
    if (!accepted) f.providerResponse = { data: {} };
    const res = response();
    await register({ validatedData: { name: 'Rider', email, password: 'CorrectPassword123!', consent_given: true, age_confirmed: true } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.verification_email_submitted, accepted);
    assert.equal(f.payloads.length, 1);
    assert.equal(f.payloads[0].to, email);
    const token = f.payloads[0].text.match(/#\/verify-email\?token=([a-f0-9]{64})/)[1];
    assert.ok(f.payloads[0].text.includes(`${origin}/#/verify-email?token=${token}`));
    const insert = f.queries.find(q => q.sql.includes('INSERT INTO users'));
    assert.equal(insert.args[5], createHash('sha256').update(token).digest('hex'));
    assert.equal(f.queries.some(q => q.sql.includes('SET email_verification_sent_at = NOW()')), accepted);
    assert.doesNotMatch(JSON.stringify([res.body, f.logs]), new RegExp(`${token}|re_private_auth_key`));
    assert.equal(JSON.stringify(f.logs).includes(email), false);
  });
}

test('forgot-password remains available during recovery lock and sends to the existing account with a hashed expiring token and retains generic responses on failure/missing account', async () => {
  const f = fixture(); f.user.login_lock_stage = 3; f.user.login_security_locked_at = new Date();
  const success = response();
  await forgotPassword({ validatedData: { email } }, success);
  assert.equal(f.payloads.length, 1);
  assert.equal(f.payloads[0].to, email);
  const token = f.payloads[0].text.match(/#\/reset-password\?token=([a-f0-9]{64})/)[1];
  assert.ok(f.payloads[0].text.includes(`${origin}/#/reset-password?token=${token}`));
  const update = f.queries.find(q => q.sql.includes('SET password_reset_token'));
  assert.equal(update.args[0], createHash('sha256').update(token).digest('hex'));
  assert.ok(update.args[1] > new Date() && update.args[1].getTime() <= Date.now() + 3600000);
  f.providerResponse = { data: null, error: { name: 'validation_error', statusCode: 403, message: 'Domain not verified' } };
  const failure = response(); await forgotPassword({ validatedData: { email } }, failure);
  assert.equal(f.payloads.length, 2);
  f.user = null;
  const missing = response(); await forgotPassword({ validatedData: { email } }, missing);
  assert.equal(f.payloads.length, 2);
  assert.deepEqual(failure.body, success.body); assert.deepEqual(missing.body, success.body);
  assert.equal(missing.statusCode, 200);
  const allTokens = f.payloads.map(p => p.text.match(/token=([a-f0-9]{64})/)[1]);
  assert.doesNotMatch(JSON.stringify([success.body, failure.body, missing.body, f.logs]), new RegExp([...allTokens, 're_private_auth_key', email.replace('.', '\\.')].join('|')));
  assert.ok(f.logs.some(([event, details]) => event === 'EMAIL_SEND_FAILED' && details.reason === 'domain_not_verified' && details.event_type === 'password_reset'));
});

test('Resend verification failure restores cooldown and permits a later successful resend without replacing the previous token prematurely', async () => {
  const f = fixture();
  f.providerResponse = { data: null, error: { name: 'validation_error', statusCode: 403, message: 'Domain not verified' } };
  const failure = response(); await resendVerification({ validatedData: { email } }, failure);
  assert.equal(failure.statusCode, 503);
  assert.equal(f.user.email_verification_sent_at, null);
  assert.equal(f.queries.some(q => q.sql.includes('SET email_verification_token')), false);
  assert.doesNotMatch(JSON.stringify(failure.body), /Domain not verified|validation_error/);
  f.providerResponse = { data: { id: 'resend-retry-id' }, error: null };
  const retry = response(); await resendVerification({ validatedData: { email } }, retry);
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.body.verification_email_submitted, true);
  assert.equal(f.payloads.length, 2);
  assert.ok(f.queries.some(q => q.sql.includes('SET email_verification_token')));
});

test('production never sends a localhost reset link and still returns the generic forgot-password response', async () => {
  const f = fixture();
  Object.assign(process.env, { NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://localhost:5173' });
  const res = response();
  await forgotPassword({ validatedData: { email } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'If an account exists for this email, password reset instructions have been sent.' });
  assert.equal(f.payloads.length, 0);
  assert.ok(f.logs.some(([event, details]) => event === 'EMAIL_LINK_CONFIGURATION_FAILED' && details.code === 'EMAIL_FRONTEND_URL_INVALID'));
});
