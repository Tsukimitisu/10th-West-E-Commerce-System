import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/privacy_test';
const { default: pool } = await import('../config/database.js');
const { editStaff } = await import('./staffController.js');
const { lockedAccountSummary, maskEmail, maskPhone } = await import('../utils/masking.js');
const { securityPolicy } = await import('../services/securityPolicy.js');
afterEach(() => mock.restoreAll());
after(() => pool.end());
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });

test('locked-account serializer exposes only masked identity and protection metadata', () => {
  const row = lockedAccountSummary({ id: 1, name: 'Private Person', email: 'customer@10thwest.com', phone: '+639123456789',
    address: 'Private address', password_hash: 'private hash', two_factor_secret: 'private TOTP', role: 'customer', login_attempts: 5,
    login_lock_stage: 3, login_security_locked_at: new Date(), locked_until: null });
  assert.deepEqual(Object.keys(row).sort(), ['id', 'masked_email', 'category', 'login_attempts', 'lock_stage', 'locked_until', 'recovery_required'].sort());
  assert.equal(row.masked_email, 'c•••••••@10thwest.com'); assert.equal(row.recovery_required, true);
  assert.doesNotMatch(JSON.stringify(row), /Private|customer@|639123|private hash|TOTP/);
  assert.equal(maskPhone('+639123456789'), '+63•••••••789'); assert.equal(maskEmail(null), '•••••••');
});

test('administrative email mutation is rejected for every actor before database writes', async () => {
  const query = mock.method(pool, 'query', async () => { throw new Error('must not query'); });
  for (const role of ['super_admin', 'owner', 'admin', 'store_staff']) {
    const res = response();
    await editStaff({ user: { id: 1, role }, params: { id: '2' }, body: { name: 'Staff', role: 'store_staff', email: 'changed@example.test' } }, res);
    assert.equal(res.statusCode, 400); assert.equal(res.body.message, 'User email cannot be changed from administration.');
  }
  assert.equal(query.mock.callCount(), 0);
});

test('unrelated allowed staff edits still persist without email in SET or audit details', async () => {
  const writes = [];
  mock.method(pool, 'query', async (sql, args) => {
    if (sql.includes('SELECT *')) return { rows: [{ id: 2, role: 'store_staff' }] };
    writes.push({ sql, args }); return { rows: [{ id: 2, name: 'Updated', role: 'store_staff' }], rowCount: 1 };
  });
  const res = response(); await editStaff({ user: { id: 1, role: 'owner' }, params: { id: '2' }, body: { name: 'Updated', phone: '09123456789', role: 'store_staff' } }, res);
  assert.equal(res.statusCode, 200);
  const update = writes.find(q => q.sql.startsWith('UPDATE users'));
  assert.doesNotMatch(update.sql.split('RETURNING')[0], /email/); assert.deepEqual(update.args, ['Updated', 'store_staff', '09123456789', '2']);
});

test('staff-management password reset honors saved policy, clears lock/challenges and revokes sessions without changing 2FA', async () => {
  const writes = [];
  mock.method(securityPolicy, 'get', async () => ({ password_min_length: 16 }));
  mock.method(pool, 'query', async (sql, args) => {
    if (sql.includes('SELECT * FROM users') || sql.includes('SELECT *\n')) return { rows: [{ id: 2, role: 'store_staff' }] };
    writes.push({ sql, args }); return { rows: [{ id: 2 }], rowCount: 1 };
  });
  const request = password => ({ user: { id: 1, role: 'super_admin' }, params: { id: '2' }, body: { name: 'Staff', role: 'store_staff', password } });
  const weak = response(); await editStaff(request('Short1!'), weak); assert.equal(weak.statusCode, 400); assert.equal(writes.length, 0);
  const res = response(); await editStaff(request('NewAdminPassword123!'), res); assert.equal(res.statusCode, 200);
  const reset = writes.find(q => q.sql.includes('WITH changed AS'));
  assert.match(reset.sql, /login_lock_stage = 0, login_security_locked_at = NULL/);
  assert.match(reset.sql, /UPDATE password_reset_sms_challenges SET consumed_at/); assert.doesNotMatch(reset.sql, /two_factor/);
  assert.match(reset.args[3], /^\$2[ab]\$12\$/);
  assert.ok(writes.some(q => q.sql.includes('UPDATE sessions SET is_active = false')));
});
