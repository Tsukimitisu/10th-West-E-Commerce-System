import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, afterEach, mock } from 'node:test';
import bcrypt from 'bcryptjs';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/recovery_test';
process.env.SESSION_SECRET = 'isolated-recovery-hmac-secret';
const { default: pool } = await import('../config/database.js');
const { createPasswordRecovery, PHONE_RECOVERY_MESSAGE } = await import('./passwordRecovery.js');
const { sendTextBeeCode } = await import('./phoneOtp.js');
const { resetPassword } = await import('../controllers/authController.js');
const { securityPolicy } = await import('./securityPolicy.js');
afterEach(() => mock.restoreAll());
after(() => pool.end());
const phone = '+639123456789';
const config = () => ({ available: true, cooldown: 60, daily: 5, attempts: 5 });

function fixture() {
  const f = { now: Date.now(), eligible: true, verified: true, queries: [], sent: [], logs: [], challenge: null,
    user: { id: 7, phone, is_active: true, is_deleted: false, password_hash: 'local-password-hash', login_lock_stage: 3, login_security_locked_at: new Date(), two_factor_enabled: true }, grantHash: null };
  for (const method of ['warn', 'error', 'info']) mock.method(console, method, (...args) => f.logs.push(args));
  // Serialize mock transactions just like SELECT ... FOR UPDATE on the user.
  let tail = Promise.resolve();
  const query = async (sql, args = []) => {
    f.queries.push({ sql, args });
    if (sql.includes('JOIN phone_verifications')) {
      assert.match(sql, /v\.verified_at IS NOT NULL/); assert.match(sql, /u\.is_active = true/);
      assert.match(sql, /u\.is_deleted/); assert.match(sql, /u\.password_hash IS NOT NULL/);
      assert.match(sql, /FOR UPDATE OF u/);
      return { rows: f.eligible && f.verified && f.user.is_active && !f.user.is_deleted && f.user.password_hash
        ? f.duplicate ? [f.user, { ...f.user, id: 8 }] : [f.user] : [] };
    }
    if (sql.includes('FROM password_reset_sms_challenges')) {
      const c = f.challenge;
      return { rows: c && (!args[1] || args[1] === c.id || typeof args[1] === 'number') ? [{ ...c,
        cooling_down: f.now - c.created_at < config().cooldown * 1000,
        new_window: f.now - c.window_started_at >= 86400000, unexpired: c.expires_at > f.now }] : [] };
    }
    if (sql.includes('INSERT INTO password_reset_sms_challenges')) {
      assert.match(sql, /ON CONFLICT \(user_id\)/);
      f.challenge = { id: args[1], code_hash: args[2], attempts: 0, consumed_at: null, delivery_accepted: false,
        created_at: f.now, expires_at: f.now + 300000, window_started_at: args[3] || !f.challenge ? f.now : f.challenge.window_started_at,
        send_count: args[3] || !f.challenge ? 1 : f.challenge.send_count + 1 };
    }
    if (sql.includes('SET delivery_accepted')) { if (f.challenge.id === args[0]) f.challenge.delivery_accepted = true; }
    if (sql.includes('SET attempts = attempts + 1')) {
      f.challenge.attempts++;
      if (args[1] || f.challenge.attempts >= args[2]) f.challenge.consumed_at = f.now;
    }
    if (sql.includes("password_reset_expires = NOW() + INTERVAL '10 minutes'")) {
      assert.match(args[0], /^[a-f0-9]{64}$/); f.grantHash = args[0]; f.grantExpires = f.now + 600000;
    }
    if (sql.includes('FROM users WHERE password_reset_token')) {
      return { rows: f.grantHash === args[0] && f.grantExpires > f.now ? [{ ...f.user, password_hash: null }] : [] };
    }
    if (sql.includes('WITH reset_user AS')) {
      assert.match(sql, /login_lock_stage = 0, login_security_locked_at = NULL/);
      assert.match(sql, /UPDATE password_reset_sms_challenges SET consumed_at/);
      assert.doesNotMatch(sql, /two_factor/);
      if (f.grantHash !== args[2] || f.grantExpires <= f.now) return { rows: [], rowCount: 0 };
      f.grantHash = null; f.user.password_hash = args[0]; f.user.login_lock_stage = 0; f.user.login_security_locked_at = null;
      f.challenge.consumed_at = f.now;
    }
    return { rows: [], rowCount: 1 };
  };
  const db = { query, async connect() {
    let unlock;
    return { async query(sql, args) {
      if (sql === 'BEGIN') { const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous; }
      return query(sql, args);
    }, release() { unlock?.(); } };
  } };
  const send = async input => {
    if (f.sendGate) await f.sendGate;
    if (f.failProvider) throw new Error('provider secret must not reach logs');
    await sendTextBeeCode(input, async (_url, options) => {
      f.sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ data: { success: true, smsBatchId: 'mock-only' } }) };
    }, { TEXTBEE_API_KEY: 'txb_mock_never_log' });
  };
  f.service = createPasswordRecovery({ db, send, config }); f.db = db;
  f.request = async () => {
    const result = await f.service.request('09123456789');
    await new Promise(resolve => setImmediate(resolve));
    return result;
  };
  f.code = () => f.sent.at(-1).message.match(/code is (\d{6})/)[1];
  f.verify = (code = f.code(), id = f.challenge.id) => f.service.verify({ phone, challenge_id: id, code });
  return f;
}

test('verified local account receives purpose-specific mocked TextBee OTP while recovery locked; stored code is HMAC only', async () => {
  const f = fixture(), result = await f.request();
  assert.equal(result.message, PHONE_RECOVERY_MESSAGE); assert.equal(result.expires_in, 300);
  assert.equal(f.sent.length, 1); assert.match(f.sent[0].message, /password reset code/);
  assert.match(f.challenge.code_hash, /^[a-f0-9]{64}$/); assert.notEqual(f.challenge.code_hash, f.code());
  for (const secret of [f.code(), 'txb_mock', phone, f.challenge.code_hash]) assert.equal(JSON.stringify([result, f.logs]).includes(secret), false);
});

test('ineligible/unverified/nonexistent/inactive accounts and delivery failure return the same generic shape', async () => {
  const f = fixture(); f.eligible = false;
  const ineligible = await f.request(); assert.equal(f.sent.length, 0);
  f.eligible = true; f.failProvider = true;
  const failed = await f.request(); assert.equal(f.sent.length, 0);
  assert.deepEqual({ ...failed, challenge_id: null }, { ...ineligible, challenge_id: null });
  assert.equal(f.challenge.delivery_accepted, false);
  assert.doesNotMatch(JSON.stringify(f.logs), /provider secret|txb_mock|639123/);
});

for (const [reason, change] of [
  ['unverified', f => { f.verified = false; }],
  ['inactive', f => { f.user.is_active = false; }],
  ['deleted', f => { f.user.is_deleted = true; }],
  ['OAuth-only', f => { f.user.password_hash = null; }],
  ['ambiguous shared phone', f => { f.duplicate = true; }],
  ['changed profile phone', f => { f.user.phone = '+639999999999'; }],
]) test(`${reason} phone receives generic response without provider call`, async () => {
  const f = fixture(); change(f);
  const result = await f.request();
  assert.equal(result.message, PHONE_RECOVERY_MESSAGE); assert.equal(f.sent.length, 0); assert.equal(f.challenge, null);
});

test('public request does not wait for provider latency; unaccepted delivery cannot verify', async () => {
  const f = fixture(); let accept;
  f.sendGate = new Promise(resolve => { accept = resolve; });
  const result = await f.request();
  assert.equal(result.message, PHONE_RECOVERY_MESSAGE); assert.equal(f.challenge.delivery_accepted, false);
  assert.equal(await f.verify('000000'), null);
  accept(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.challenge.delivery_accepted, true);
});

test('wrong codes consume five attempts without sending SMS; expiry and reused OTP are denied', async () => {
  const f = fixture(); await f.request();
  for (let i = 0; i < 5; i++) assert.equal(await f.verify('000000'), null);
  assert.ok(f.challenge.consumed_at); assert.equal(await f.verify(), null); assert.equal(f.sent.length, 1);
  f.now += 61000; await f.request(); f.now += 300001;
  assert.equal(await f.verify(), null);
});

test('database cooldown and daily cap survive IP changes, concurrent resends, consumed codes and provider failures', async () => {
  const f = fixture(); await Promise.all([f.request(), f.request(), f.request()]); assert.equal(f.sent.length, 1);
  const firstId = f.challenge.id;
  for (let i = 1; i < 5; i++) { f.now += 61000; await f.request(); }
  assert.equal(f.sent.length, 5); assert.notEqual(f.challenge.id, firstId);
  assert.equal(await f.verify('000000', firstId), null);
  f.now += 61000; await f.request(); assert.equal(f.sent.length, 5);
  f.now += 86400000; await f.request(); assert.equal(f.sent.length, 6);
});

test('concurrent correct OTP verification issues one hashed ten-minute grant; reset uses existing policy/bcrypt, clears locks and preserves 2FA', async () => {
  const f = fixture(); await f.request();
  const grants = await Promise.all([f.verify(), f.verify()]);
  assert.equal(grants.filter(Boolean).length, 1);
  const grant = grants.find(Boolean);
  assert.equal(f.grantHash, crypto.createHash('sha256').update(grant).digest('hex'));
  mock.method(pool, 'query', f.db.query);
  mock.method(securityPolicy, 'get', async () => ({ password_min_length: 16, password_require_uppercase: true, password_require_lowercase: true, password_require_number: true, password_require_special: true }));
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
  const weak = response(); await resetPassword({ body: { token: grant, newPassword: 'Short1!' } }, weak); assert.equal(weak.statusCode, 400);
  const good = response(); await resetPassword({ body: { token: grant, newPassword: 'NewRecoveryPassword123!' } }, good);
  assert.equal(good.statusCode, 200); assert.match(f.user.password_hash, /^\$2[ab]\$12\$/);
  assert.equal(await bcrypt.compare('NewRecoveryPassword123!', f.user.password_hash), true);
  assert.equal(f.user.login_lock_stage, 0); assert.equal(f.user.login_security_locked_at, null); assert.equal(f.user.two_factor_enabled, true);
  assert.ok(f.queries.some(q => q.sql.includes('UPDATE sessions SET is_active = false')));
  const again = response(); await resetPassword({ body: { token: grant, newPassword: 'AnotherRecoveryPassword123!' } }, again); assert.equal(again.statusCode, 400);
  assert.doesNotMatch(JSON.stringify(f.logs), new RegExp(`${grant}|${f.code()}|txb_mock`));
});

test('expired grant cannot reset a password', async () => {
  const f = fixture(); await f.request(); const grant = await f.verify(); f.now += 600001;
  mock.method(pool, 'query', f.db.query); mock.method(securityPolicy, 'get', async () => ({ password_min_length: 8 }));
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
  await resetPassword({ body: { token: grant, newPassword: 'NewRecoveryPassword123!' } }, res);
  assert.equal(res.statusCode, 400); assert.equal(f.user.password_hash, 'local-password-hash');
});
