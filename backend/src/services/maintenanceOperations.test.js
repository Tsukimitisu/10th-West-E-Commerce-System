import test, { before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import express from 'express';
import speakeasy from 'speakeasy';
import migration from '../../migrations/202610240001_system_operations.cjs';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/operations_test';
process.env.TWO_FACTOR_ENCRYPTION_KEY = 'isolated-operations-two-factor-test-key';
const { default: pool } = await import('../config/database.js');
const { changeMaintenance, readMaintenance } = await import('./maintenanceControl.js');
const { cleanupStatus, runMaintenanceCleanup } = await import('./maintenance.js');
const { operationsStatus } = await import('./operationsDiagnostics.js');
const { createMaintenanceMiddleware, publicMaintenanceStatus } = await import('../middleware/maintenanceMode.js');
const { createMaintenanceRouter } = await import('../routes/maintenance.js');
const { generateCsrfToken } = await import('../middleware/csrf.js');
const { encryptTwoFactorSecret } = await import('./twoFactorCrypto.js');
const db = new PGlite();
let tail = Promise.resolve(), server, base, csrf;
const queries = [];
const query = async (sql, args = []) => { queries.push(sql); const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
const database = { query, connect: async () => {
  const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
  return { query, release };
} };
const password = 'FixtureOnly-Password-2026!';
const secret = 'JBSWY3DPEHPK3PXP';
const body = active => ({ active, reason: 'Scheduled shop update', password, acknowledgement: true });
const auth = (req, res, next) => {
  if (!req.headers['x-test-role']) return res.status(401).json({ message: 'Sign in required' });
  req.user = { id: 7, role: req.headers['x-test-role'], two_factor_enabled: false }; next();
};
before(async () => {
  mock.method(pool, 'query', async () => ({ rows: [{ request_count: 1, retry_after_seconds: 60 }], rowCount: 0 }));
  await db.exec(`CREATE TABLE users(id int PRIMARY KEY,name text,role text,is_active boolean,is_deleted boolean,password_hash text,two_factor_enabled boolean,two_factor_secret text);
    CREATE TABLE system_settings(category text,key text,value text,updated_by int,updated_at timestamptz,UNIQUE(category,key));
    CREATE TABLE audit_logs(id serial PRIMARY KEY,actor_user_id int,action text,entity_type text,entity_id text,ip_address text,user_agent text,before_data jsonb,after_data jsonb,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE sessions(is_active boolean,expires_at timestamptz);
    CREATE TABLE http_sessions(expire timestamptz);
    CREATE TABLE idempotency_keys(expires_at timestamptz);
    CREATE TABLE notification_deliveries(status text,created_at timestamptz);
    CREATE TABLE error_logs(created_at timestamptz);
    CREATE TABLE backup_records(status text,created_at timestamptz,completed_at timestamptz,deleted_at timestamptz);`);
  await migration.up({ raw: sql => db.exec(sql) });
  await query('INSERT INTO users VALUES(7,$1,$2,true,false,$3,false,NULL)', ['Shop Operator', 'super_admin', await bcrypt.hash(password, 4)]);
  const app = express(); app.use(express.json());
  app.get('/csrf', generateCsrfToken, (req, res) => res.json({ token: req.csrfToken }));
  app.get('/api/maintenance-status', publicMaintenanceStatus(database));
  app.use('/api/admin/maintenance', createMaintenanceRouter({ db: database, authenticate: auth }));
  app.use(createMaintenanceMiddleware({ db: database, authenticate: (req, res, next) => {
    if (req.headers['x-test-role']) req.user = { role: req.headers['x-test-role'], requires_2fa_challenge: req.headers['x-test-2fa-required'] === '1' }; next();
  } }));
  app.use((_req, res) => res.json({ reached: true }));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  csrf = (await (await fetch(`${base}/csrf`)).json()).token;
});
beforeEach(async () => {
  await db.exec("DELETE FROM system_settings; DELETE FROM audit_logs; UPDATE users SET role='super_admin',two_factor_enabled=false,two_factor_secret=NULL; UPDATE system_cleanup_status SET running=false,last_started_at=NULL,last_completed_at=NULL,last_result=NULL,last_counts=NULL;");
  queries.length = 0;
});
after(async () => { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); await pool.end(); await db.close(); });
const call = (path, role, payload, extraHeaders = {}) => fetch(`${base}${path}`, {
  method: payload ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}), ...extraHeaders },
  ...(payload ? { body: JSON.stringify(payload) } : {}),
});

test('maintenance changes are Super Admin only and require CSRF plus fresh password', async () => {
  assert.equal((await call('/api/admin/maintenance', null, body(true))).status, 401);
  for (const role of ['customer', 'owner', 'admin', 'store_staff', 'cashier']) assert.equal((await call('/api/admin/maintenance', role, body(true))).status, 403);
  assert.equal((await call('/api/admin/maintenance', 'super_admin', body(true))).status, 403);
  const response = await call('/api/admin/maintenance', 'super_admin', { ...body(true), password: 'wrong' }, { 'x-csrf-token': csrf });
  assert.equal(response.status, 403); assert.equal((await response.json()).code, 'FRESH_AUTH_REQUIRED');
  assert.equal((await readMaintenance(database)).active, false);
  assert.equal((await query('SELECT action FROM audit_logs')).rows[0].action, 'maintenance.change_failed');
});

test('fresh authenticator code is mandatory when enabled; credentials are never audited', async () => {
  await query('UPDATE users SET two_factor_enabled=true,two_factor_secret=$1', [encryptTwoFactorSecret(secret)]);
  await assert.rejects(changeMaintenance(database, 7, body(true), {}), { code: 'FRESH_TOTP_REQUIRED' });
  await changeMaintenance(database, 7, { ...body(true), totp_code: speakeasy.totp({ secret, encoding: 'base32' }) }, {});
  const history = JSON.stringify((await query('SELECT * FROM audit_logs')).rows);
  assert.doesNotMatch(history, /FixtureOnly|JBSWY|password_hash|totp_code|two_factor_secret/);
});

test('activation and ending are transactional, audited and persist across fresh reads', async () => {
  const response = await call('/api/admin/maintenance', 'super_admin', { ...body(true), message: 'Shop update in progress.' }, { 'x-csrf-token': csrf });
  assert.equal(response.status, 200);
  const restoredRead = await readMaintenance({ query });
  assert.equal(restoredRead.active, true); assert.equal(restoredRead.message, 'Shop update in progress.');
  assert.ok(queries.some(sql => /FOR UPDATE/.test(sql)));
  await assert.rejects(changeMaintenance(database, 7, body(true), {}), { status: 409 });
  await changeMaintenance(database, 7, body(false), {});
  const events = (await query('SELECT action,metadata FROM audit_logs ORDER BY id')).rows;
  assert.deepEqual(events.map(row => row.action), ['maintenance.started', 'maintenance.ended']);
  assert.ok(events.every(row => row.metadata.outcome === 'success'));
  assert.equal((await readMaintenance(database)).active, false);
});

test('simultaneous activation attempts produce one state change and one audit event', async () => {
  const results = await Promise.allSettled([changeMaintenance(database, 7, body(true), {}), changeMaintenance(database, 7, body(true), {})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='maintenance.started'")).rows[0].count, 1);
});

test('unsafe customer and guest writes are blocked, while operations, health and payment recovery remain reachable', async () => {
  await changeMaintenance(database, 7, body(true), {});
  for (const role of ['customer', null]) for (const path of ['/api/checkout', '/API/CHECKOUT', '/api/orders', '/api/cart/add', '/api/users/profile', '/api/addresses', '/api/payments/gcash/checkout']) {
    const result = await fetch(`${base}${path}`, { method: 'POST', headers: { ...(role ? { 'x-test-role': role } : {}) } });
    assert.equal(result.status, 503); assert.equal((await result.json()).code, 'MAINTENANCE_MODE'); assert.equal(result.headers.get('Retry-After'), '60');
  }
  for (const role of ['owner', 'admin', 'super_admin', 'store_staff', 'cashier']) assert.equal((await fetch(`${base}/api/pos/orders`, { method: 'POST', headers: { 'x-test-role': role } })).status, 200);
  assert.equal((await fetch(`${base}/api/cart/add`, { method: 'POST', headers: { 'x-test-role': 'owner', 'x-test-2fa-required': '1' } })).status, 503);
  for (const path of ['/api/health', '/api/ready', '/api/maintenance-status', '/api/payments/88/reconciliation', '/api/payments/orders/88/status', '/api/admin/backups/status']) assert.equal((await fetch(`${base}${path}`)).status, 200);
  for (const path of ['/api/payments/paymongo/webhook', '/api/auth/login', '/api/auth/logout', '/api/auth/reset-password', '/api/auth/forgot-password/phone/verify']) assert.equal((await fetch(`${base}${path}`, { method: 'POST' })).status, 200);
  const publicState = await (await fetch(`${base}/api/maintenance-status`)).json();
  assert.deepEqual(Object.keys(publicState).sort(), ['active', 'message']);
});

test('cleanup records success counts and uses existing cleanup operations', async () => {
  await db.exec("INSERT INTO sessions VALUES(true,now()-INTERVAL '1 day'); INSERT INTO http_sessions VALUES(now()-INTERVAL '1 day'); INSERT INTO idempotency_keys VALUES(now()-INTERVAL '2 days'); INSERT INTO notification_deliveries VALUES('sent',now()-INTERVAL '31 days');");
  const summary = await runMaintenanceCleanup({ db: database, releaseReservations: async () => 2, cleanupLimits: async () => 3 });
  assert.equal(summary.sessions_expired, 1); assert.equal(summary.reservations_released, 2); assert.equal(summary.rate_limits_deleted, 3);
  assert.equal(summary.http_sessions_deleted, 1); assert.equal(summary.idempotency_keys_deleted, 1); assert.equal(summary.notification_deliveries_deleted, 1);
  const status = await cleanupStatus(database, { env: {} });
  assert.equal(status.status, 'healthy'); assert.equal(status.last_result, 'successful'); assert.ok(status.next_expected_run);
});

test('unconfirmed maintenance state fails closed for customers but does not prevent authorized recovery', async () => {
  await query("INSERT INTO system_settings(category,key,value) VALUES('system','maintenance_mode','invalid')");
  const blocked = await fetch(`${base}/api/checkout`, { method: 'POST' });
  assert.equal(blocked.status, 503); assert.equal((await blocked.json()).code, 'MAINTENANCE_STATUS_UNAVAILABLE');
  const recovery = await fetch(`${base}/api/admin/backups/example/restore`, { method: 'POST', headers: { 'x-test-role': 'super_admin' } });
  assert.equal(recovery.status, 200);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('cleanup failures are recorded and stale or absent schedulers need attention', async () => {
  assert.equal((await cleanupStatus(database, { env: {} })).status, 'not_running');
  await assert.rejects(runMaintenanceCleanup({ db: database, releaseReservations: async () => { throw new Error('private-provider-diagnostic'); } }));
  assert.equal((await cleanupStatus(database, { env: {} })).last_result, 'failed');
  await query("UPDATE system_cleanup_status SET last_result='successful',last_started_at=now()-INTERVAL '1 hour'");
  const stale = await cleanupStatus(database, { env: {} });
  assert.equal(stale.status, 'needs_attention'); assert.equal(stale.stale, true);
  assert.equal((await cleanupStatus(database, { env: { MAINTENANCE_CLEANUP_DISABLED: 'true' } })).status, 'not_running');
  assert.doesNotMatch(JSON.stringify(stale), /private-provider/);
});

test('support diagnostics are bounded categories, contain no PII/secrets, and never send provider requests', async () => {
  await changeMaintenance(database, 7, body(true), {});
  const network = mock.method(globalThis, 'fetch', async () => { throw new Error('Provider network requests are forbidden in this test.'); });
  let result;
  try { result = await operationsStatus(database, { RENDER_GIT_COMMIT: 'abcdef0123456789', DATABASE_URL: 'must-not-leak-database', RESEND_API_KEY: 'must-not-leak-key' }); }
  finally { network.mock.restore(); }
  assert.equal(network.mock.calls.length, 0);
  assert.equal(result.diagnostics.database, 'connected'); assert.equal(result.diagnostics.maintenance, 'active');
  assert.equal(result.diagnostics.commit, 'abcdef012345'); assert.ok(result.diagnostics.reference);
  assert.doesNotMatch(JSON.stringify(result.diagnostics), /Shop Operator|Scheduled shop|password|secret|token|must-not-leak|postgres|api_key/i);
  assert.match(result.diagnostics.integration_check, /not tested/);
});

test('the new migration preserves settings and refuses rollback while cleanup is running', async () => {
  await changeMaintenance(database, 7, body(true), {});
  await query('UPDATE system_cleanup_status SET running=true');
  await assert.rejects(migration.down({ raw: sql => db.query(sql), schema: { dropTable: () => { throw new Error('must not drop'); } } }), /Wait for automatic cleanup/);
  assert.equal((await readMaintenance(database)).active, true);
});
