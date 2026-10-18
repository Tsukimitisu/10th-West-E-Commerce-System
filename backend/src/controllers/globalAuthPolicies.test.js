import assert from 'node:assert/strict';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/auth_policy_test';
process.env.JWT_SECRET = 'isolated-policy-jwt-key';
process.env.TWO_FACTOR_ENCRYPTION_KEY = 'isolated-policy-totp-key-at-least-32-characters';
const { default: pool } = await import('../config/database.js');
const { registerValidation } = await import('../routes/auth.js');
const auth = await import('./authController.js');
const userController = await import('./userController.js');
const { authenticateToken, authenticateOptional } = await import('../middleware/auth.js');
const { securityPolicy } = await import('../services/securityPolicy.js');
const { encryptTwoFactorSecret, hashRecoveryCode } = await import('../services/twoFactorCrypto.js');
beforeEach(() => securityPolicy.invalidate());
afterEach(() => mock.restoreAll());
after(() => pool.end().catch(() => {}));

test('registration honors the saved minimum password length', async () => {
  mock.method(pool, 'query', async () => ({ rows: [{ key: 'password_min_length', value: '16' }] }));
  const req = { body: { name: 'Test Rider', email: 'rider@example.test', password: 'ShortPass12!', confirmPassword: 'ShortPass12!', consent_given: true, age_confirmed: true } };
  const { validationResult } = await import('express-validator');
  for (const rule of registerValidation) await rule.run(req);
  assert.equal(validationResult(req).array().some(error => error.path === 'password'), true);
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const session = () => ({ cookie: { maxAge: 7 * 86400000 }, save(done) { done(); }, regenerate(done) { delete this.auth; done(); } });
const password = 'CorrectPass123!';
const fixture = async (settings = {}) => {
  const user = { id: 11, email: 'rider@example.test', role: 'customer', name: 'Test Rider', is_active: true, email_verified: true,
    password_hash: await bcrypt.hash(password, 4), login_attempts: 0, locked_until: null, two_factor_enabled: false };
  const queries = [], sessions = new Map();
  mock.method(pool, 'query', async (sql, args = []) => {
    queries.push({ sql, args });
    if (sql.includes('FROM system_settings')) return { rows: Object.entries(settings).map(([key, value]) => ({ key, value })) };
    if (sql.includes('JOIN sessions s')) {
      assert.match(sql, /s.created_at > NOW\(\) - make_interval\(mins => \$3\)/);
      const stored = sessions.get(args[1]);
      return { rows: stored?.active && stored.created > Date.now() - args[2] * 60000 ? [{ ...user }] : [] };
    }
    if (/SELECT id\s+FROM sessions/.test(sql)) {
      const row = sessions.get(args[0]);
      assert.match(sql, /created_at > NOW\(\) - make_interval\(mins => \$3\)/);
      return { rows: row && row.active && row.created > Date.now() - args[2] * 60000 ? [{ id: 1 }] : [] };
    }
    if (sql.includes('FROM users')) return { rows: [{ ...user }] };
    if (sql.includes('INSERT INTO sessions')) { sessions.set(args[1], { active: true, created: Date.now() }); return { rows: [], rowCount: 1 }; }
    if (sql.includes('UPDATE sessions SET is_active')) { if (sessions.has(args[0])) sessions.get(args[0]).active = false; return { rows: [], rowCount: 1 }; }
    if (sql.includes('UPDATE users SET\n         login_attempts')) {
      assert.match(sql, /locked_until IS NULL OR locked_until <= NOW/);
      if (!user.locked_until || user.locked_until <= new Date()) {
        user.login_attempts = user.locked_until ? 1 : user.login_attempts + 1;
        user.locked_until = user.login_attempts >= args[1] ? new Date(Date.now() + args[2] * 60000) : null;
      }
    }
    if (sql.includes('SET login_attempts = 0')) {
      if (user.locked_until > new Date()) return { rows: [], rowCount: 0 };
      user.login_attempts = 0; user.locked_until = null;
    }
    if (sql.includes('SET two_factor_secret=')) user.two_factor_secret = args[0];
    if (sql.includes('SET two_factor_enabled=true')) { user.two_factor_enabled = true; user.two_factor_recovery_hashes = JSON.parse(args[1]); }
    if (sql.includes('two_factor_recovery_hashes - $2')) {
      const index = user.two_factor_recovery_hashes.indexOf(args[1]);
      if (index < 0) return { rows: [], rowCount: 0 };
      user.two_factor_recovery_hashes.splice(index, 1);
    }
    return { rows: [], rowCount: 1 };
  });
  const request = (pass = password) => ({ validatedData: { email: user.email, password: pass }, body: {}, headers: {}, clientIp: '127.0.0.1', clientUa: 'policy-test', session: session() });
  return { user, queries, sessions, request, settings };
};

test('saved lockout threshold/duration apply; attempts below threshold remain unlocked and lock expires', async () => {
  const f = await fixture({ max_login_attempts: '2', lockout_duration_minutes: '7' });
  await auth.login(f.request('wrong'), response()); assert.equal(f.user.login_attempts, 1); assert.equal(f.user.locked_until, null);
  await auth.login(f.request('wrong'), response()); assert.equal(f.user.login_attempts, 2);
  assert.ok(f.user.locked_until.getTime() >= Date.now() + 6.9 * 60000);
  const locked = response(); await auth.login(f.request(), locked);
  assert.equal(locked.statusCode, 401); assert.equal(locked.body.message, 'Invalid email or password');
  assert.equal(f.sessions.size, 0);
  f.user.locked_until = new Date(Date.now() - 1);
  const unlocked = response(); await auth.login(f.request(), unlocked);
  assert.equal(unlocked.statusCode, 200); assert.equal(f.user.login_attempts, 0); assert.equal(f.user.locked_until, null);
});
test('successful authentication resets failure counters before responding', async () => {
  const f = await fixture(); f.user.login_attempts = 3;
  const res = response(); await auth.login(f.request(), res);
  assert.equal(res.statusCode, 200); assert.equal(f.user.login_attempts, 0);
});
test('Customer, Staff, Owner and Super Admin retain normal password login when 2FA is optional', async () => {
  const f = await fixture();
  for (const role of ['customer', 'store_staff', 'owner', 'super_admin']) {
    f.user.role = role; const res = response(); await auth.login(f.request(), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.user.role, role);
    assert.equal(res.body.user.requires_2fa_enrollment, false);
  }
});
test('registration, both password-change paths, reset, and local-password setup share the saved validator', async () => {
  const f = await fixture({ password_min_length: '20' });
  for (const handler of [auth.register, auth.changePassword, auth.resetPassword, userController.changePassword, userController.setLocalPassword]) {
    const req = { body: { email: f.user.email, password, newPassword: password, currentPassword: password, token: 'unused' }, user: { id: f.user.id }, headers: {} };
    const res = response(); await handler(req, res);
    assert.equal(res.statusCode, 400, handler.name); assert.match(res.body.message, /at least 20/);
  }
  assert.equal(f.queries.some(({ sql }) => /(?:INSERT INTO users|SET password_hash)/.test(sql)), false);
});
test('saved lifetime caps new JWT/session/cookie expiry and rejects existing older cookie/bearer sessions', async () => {
  const f = await fixture({ session_timeout_minutes: '5' });
  const req = f.request(); await auth.login(req, response());
  assert.ok(req.session.cookie.maxAge <= 5 * 60000);
  const inserted = f.queries.find(({ sql }) => sql.includes('INSERT INTO sessions'));
  assert.ok(inserted.args[4].getTime() <= Date.now() + 5 * 60000);
  const signing = jwt.sign({ id: f.user.id }, process.env.JWT_SECRET, { issuer: '10th-west-moto-api', audience: '10th-west-moto-web', expiresIn: '1h' });
  const { createHash } = await import('node:crypto'); const hash = createHash('sha256').update(signing).digest('hex');
  f.sessions.set(hash, { active: true, created: Date.now() - 6 * 60000 });
  for (const request of [{ headers: {}, session: { auth: { userId: f.user.id, tokenHash: hash } } }, { headers: { authorization: `Bearer ${signing}` } }]) {
    const res = response(); let granted = false; await authenticateToken(request, res, () => { granted = true; });
    assert.equal(granted, false); assert.equal(res.statusCode, 401);
  }
  const originalSign = jwt.sign;
  mock.method(jwt, 'sign', (...args) => { assert.equal(args[2].expiresIn, 300); return originalSign(...args); });
  await auth.login(f.request(), response());
});
test('required 2FA grants only enrollment/profile access and upgrades only after a verified TOTP', async () => {
  const f = await fixture({ '2fa_enforcement': 'required' });
  const req = f.request(), res = response(); await auth.login(req, res);
  assert.equal(res.body.user.requires_2fa_enrollment, true); assert.equal(req.session.auth.twoFactorVerified, false);
  const protectedReq = { headers: {}, session: req.session, originalUrl: '/api/admin/security/settings' };
  let granted = false; const denied = response(); await authenticateToken(protectedReq, denied, () => { granted = true; });
  assert.equal(granted, false); assert.equal(denied.body.code, 'TWO_FACTOR_ENROLLMENT_REQUIRED');
  const profile = { headers: {}, session: req.session, originalUrl: '/api/auth/profile/optional' };
  await authenticateOptional(profile, response(), () => {}); assert.equal(profile.user.requires_2fa_enrollment, true);
  const guest = { headers: {}, session: req.session, originalUrl: '/api/orders' };
  await authenticateOptional(guest, response(), () => {}); assert.equal(guest.user, undefined);
  const setupReq = { ...req, user: f.user, body: { password } };
  const setupRes = response(); await auth.setup2FA(setupReq, setupRes); assert.match(setupRes.body.qrCode, /^data:image/);
  const { decryptTwoFactorSecret } = await import('../services/twoFactorCrypto.js');
  const totp = speakeasy.totp({ secret: decryptTwoFactorSecret(f.user.two_factor_secret), encoding: 'base32' });
  const priorHash = req.session.auth.tokenHash;
  const verified = response(); await auth.verify2FA({ ...req, user: f.user, body: { totp_code: totp } }, verified);
  assert.equal(verified.statusCode, 200); assert.equal(verified.body.recovery_codes.length, 10);
  assert.equal(req.session.auth.twoFactorVerified, true); assert.equal(f.sessions.get(priorHash).active, false);
  const access = { headers: {}, session: req.session, originalUrl: '/api/admin/security/settings' };
  await authenticateToken(access, response(), () => { granted = true; }); assert.equal(granted, true);
  const disabled = response(); await auth.disable2FA({ user: f.user, body: { password } }, disabled); assert.equal(disabled.statusCode, 403);
});
test('enrolled login keeps its existing challenge; wrong codes never establish a session', async () => {
  const f = await fixture(); f.user.two_factor_enabled = true;
  const secret = speakeasy.generateSecret().base32; f.user.two_factor_secret = encryptTwoFactorSecret(secret);
  f.user.two_factor_recovery_hashes = [];
  const prompt = response(); await auth.login(f.request(), prompt); assert.equal(prompt.body.requires_2fa, true); assert.equal(f.sessions.size, 0);
  const bad = f.request(); bad.validatedData.totp_code = 'invalid'; const rejected = response(); await auth.login(bad, rejected);
  assert.equal(rejected.statusCode, 401); assert.equal(f.sessions.size, 0); assert.equal(f.user.login_attempts, 1);
  const good = f.request(); good.validatedData.totp_code = speakeasy.totp({ secret, encoding: 'base32' }); const accepted = response(); await auth.login(good, accepted);
  assert.equal(accepted.statusCode, 200); assert.equal(good.session.auth.twoFactorVerified, true); assert.equal(accepted.body.user.requires_2fa_challenge, false);
});
test('OAuth/pre-policy sessions challenge enrolled accounts and recovery codes are consumed once', async () => {
  const f = await fixture({ '2fa_enforcement': 'required' }); f.user.two_factor_enabled = true;
  f.user.two_factor_secret = encryptTwoFactorSecret(speakeasy.generateSecret().base32);
  const recovery = '12345678-abcd1234'; f.user.two_factor_recovery_hashes = [hashRecoveryCode(recovery)];
  const req = f.request(); req.user = f.user; req.session.auth = { userId: f.user.id, tokenHash: 'old', authenticatedAt: Date.now() };
  f.sessions.set('old', { active: true, created: Date.now() });
  const access = { headers: {}, session: req.session, originalUrl: '/api/admin/users' };
  const denied = response(); await authenticateToken(access, denied, () => assert.fail('must challenge')); assert.equal(denied.body.code, 'TWO_FACTOR_REQUIRED');
  req.body = { recovery_code: recovery }; const res = response(); await auth.challenge2FA(req, res);
  assert.equal(res.statusCode, 200); assert.equal(req.session.auth.twoFactorVerified, true);
  const duplicate = response(); await auth.challenge2FA(req, duplicate); assert.equal(duplicate.statusCode, 401);
});
test('disabled mode prevents new enrollment without disabling existing account protection', async () => {
  await fixture({ '2fa_enforcement': 'disabled' }); const res = response(); await auth.setup2FA({ user: { id: 11 } }, res); assert.equal(res.statusCode, 403);
});

test('socket authentication enforces the same enrollment, challenge and session lifetime policy', async () => {
  const f = await fixture({ '2fa_enforcement': 'required', session_timeout_minutes: '5' });
  const { createServer } = await import('node:http');
  const { io: connect } = await import('socket.io-client');
  const { initSocket } = await import('../socket.js');
  const { createHash } = await import('node:crypto');
  const server = createServer(); const io = initSocket(server, ['http://localhost']);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const tryConnect = async (verified, expired = false) => {
    const token = jwt.sign({ id: f.user.id, mfa_verified: verified }, process.env.JWT_SECRET, { issuer: '10th-west-moto-api', audience: '10th-west-moto-web' });
    f.sessions.set(createHash('sha256').update(token).digest('hex'), { active: true, created: Date.now() - (expired ? 6 * 60000 : 0) });
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 2000 });
    try { return await new Promise(resolve => { socket.on('connect', () => resolve(true)); socket.on('connect_error', () => resolve(false)); }); }
    finally { socket.disconnect(); }
  };
  try {
    assert.equal(await tryConnect(false), false);
    f.user.two_factor_enabled = true;
    assert.equal(await tryConnect(false), false);
    assert.equal(await tryConnect(true), true);
    assert.equal(await tryConnect(true, true), false);
  } finally { await new Promise(resolve => io.close(resolve)); }
});
