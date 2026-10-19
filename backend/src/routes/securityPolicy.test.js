import assert from 'node:assert/strict';
import test, { after, before, mock } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/policy_routes';
process.env.JWT_SECRET = 'isolated-security-policy-routes';
const { default: pool } = await import('../config/database.js');
const { default: admin } = await import('./admin.js');
const { default: auth } = await import('./auth.js');
const { securityPolicy } = await import('../services/securityPolicy.js');
const roles = ['customer', 'store_staff', 'owner', 'super_admin', 'cashier'];
const settings = new Map([['max_login_attempts', '5']]);
const audits = [], queries = [];
let server, base;
before(async () => {
  mock.method(pool, 'query', async (sql, args = []) => {
    queries.push({ sql, args });
    if (sql.includes('SELECT id FROM sessions')) return { rows: [{ id: 1 }] };
    if (sql.includes('SELECT id, email, role, login_attempts')) return { rows: [{ id: 1, email: 'private@example.test', role: 'customer', login_attempts: 5, login_lock_stage: 3, login_security_locked_at: new Date(), locked_until: null }] };
    if (sql.includes('FROM users')) return { rows: [{ id: args[0], role: roles[args[0] - 1], is_active: true, email_verified: true }] };
    if (sql.includes('FROM system_settings')) return { rows: [...settings].map(([key, value]) => ({ key, value, category: 'security' })) };
    if (sql.includes('INSERT INTO system_settings')) {
      const offset = sql.includes("VALUES ('security'") ? 0 : 1; settings.set(args[offset], args[offset + 1]);
    }
    if (sql.includes('INSERT INTO audit_logs')) audits.push(args);
    return { rows: [], rowCount: 1 };
  });
  mock.method(pool, 'connect', async () => ({ query: (...args) => pool.query(...args), release() {} }));
  const app = express(); app.use(express.json()); app.use('/api/admin', admin); app.use('/api/auth', auth);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}/api/admin`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); await pool.end(); });
const call = (role, path, body, method = body ? 'PUT' : 'GET') => fetch(`${base}${path}`, {
  method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: roles.indexOf(role) + 1 }, process.env.JWT_SECRET, { issuer: '10th-west-moto-api', audience: '10th-west-moto-web' })}` },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
test('every global-policy write path denies non-Super-Admin roles before writes', async () => {
  for (const role of roles.filter(role => role !== 'super_admin')) for (const [path, body] of [['/security/settings', { settings: { max_login_attempts: '2' } }], ['/settings', { category: 'security', settings: { max_login_attempts: '2' } }]]) {
    assert.equal((await call(role, path, body)).status, 403);
  }
  assert.equal(audits.length, 0); assert.equal(settings.get('max_login_attempts'), '5');
});

test('locked-account monitoring and manual unlock stay Super Admin only; responses mask PII and unlock resets protection without reactivating users', async () => {
  for (const [path, body, method] of [['/logs/suspicious', null, 'GET'], ['/users/1/unlock', {}, 'PATCH']]) {
    assert.equal((await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).status, 401);
    for (const role of roles.filter(role => role !== 'super_admin')) assert.equal((await call(role, path, body, method)).status, 403);
  }
  const monitoring = await call('super_admin', '/logs/suspicious'); assert.equal(monitoring.status, 200);
  const row = (await monitoring.json()).locked_accounts[0];
  assert.equal(row.masked_email, 'p•••••••@example.test'); assert.equal(row.recovery_required, true);
  assert.doesNotMatch(JSON.stringify(row), /private@|password_hash|two_factor_secret|phone|address/);
  assert.equal((await call('super_admin', '/users/1/unlock', {}, 'PATCH')).status, 200);
  const update = queries.find(q => q.sql.includes('SET locked_until = NULL, login_attempts = 0'));
  assert.match(update.sql, /login_lock_stage = 0, login_security_locked_at = NULL/); assert.doesNotMatch(update.sql, /is_active/);
  assert.ok(queries.some(q => q.args.includes('account_security_unlock')));
});
test('successful save invalidates runtime cache, survives reload, and audits safe names/values', async () => {
  assert.equal((await securityPolicy.get()).max_login_attempts, 5);
  const res = await call('super_admin', '/security/settings', { settings: { max_login_attempts: '3', session_timeout_minutes: '10' } });
  assert.equal(res.status, 200); assert.equal((await securityPolicy.get()).max_login_attempts, 3);
  assert.equal((await (await call('super_admin', '/security/settings')).json()).max_login_attempts, '3');
  assert.equal(audits[0][0], 4); assert.equal(JSON.parse(audits[0].at(-1)).max_login_attempts, '3');
  assert.ok(queries.some(({ sql, args }) => sql.includes('expires_at = LEAST') && args[0] === 10));
  assert.equal((await call('super_admin', '/settings', { category: 'security', settings: { max_login_attempts: '4' } })).status, 200);
  assert.equal((await securityPolicy.get()).max_login_attempts, 4);
});
test('fractional policies, unsupported 2FA modes and missing enrollment key are rejected', async () => {
  for (const settings of [{ max_login_attempts: '2.5' }, { '2fa_enforcement': 'required_staff' }, { smtp_password: 'must-not-log' }]) {
    assert.equal((await call('super_admin', '/security/settings', { settings })).status, 400);
  }
  const previous = process.env.TWO_FACTOR_ENCRYPTION_KEY; delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
  try { assert.equal((await call('super_admin', '/security/settings', { settings: { '2fa_enforcement': 'required' } })).status, 400); }
  finally { if (previous !== undefined) process.env.TWO_FACTOR_ENCRYPTION_KEY = previous; }
  assert.doesNotMatch(JSON.stringify(audits), /must-not-log|Bearer|password_hash|two_factor_secret/);
});
test('privileged password reset uses the same saved password policy before hashing or writing', async () => {
  assert.equal((await call('super_admin', '/security/settings', { settings: { password_min_length: '20' } })).status, 200);
  const before = queries.length;
  const res = await call('super_admin', '/users/1/reset-password', { newPassword: 'ShortPass123!' }, 'POST');
  assert.equal(res.status, 400); assert.match((await res.json()).message, /at least 20/);
  assert.equal(queries.slice(before).some(({ sql }) => sql.includes('SET password_hash')), false);
});
test('public effective password policy exposes only the five password requirements without authentication', async () => {
  settings.set('password_require_number', 'false'); settings.set('oauth_secret', 'private-secret');
  securityPolicy.invalidate();
  const res = await fetch(base.replace(/\/admin$/, '/auth/password-policy'));
  assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const policy = await res.json();
  assert.deepEqual(Object.keys(policy).sort(), ['password_min_length', 'password_require_lowercase', 'password_require_number', 'password_require_special', 'password_require_uppercase']);
  assert.equal(policy.password_min_length, 20); assert.equal(policy.password_require_number, false);
  assert.doesNotMatch(JSON.stringify(policy), /private-secret|lockout|oauth|session|2fa/);
});


test('maintenance/system settings remain Super Admin only through every settings alias', async () => {
  for (const role of roles.filter(role => role !== 'super_admin')) {
    assert.equal((await call(role, '/settings/system')).status, 403);
    assert.equal((await call(role, '/settings?category=system')).status, 403);
    assert.equal((await call(role, '/settings', { category: 'system', settings: { maintenance_mode: 'true' } })).status, 403);
  }
});
