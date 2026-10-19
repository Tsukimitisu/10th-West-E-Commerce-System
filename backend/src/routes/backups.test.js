import assert from 'node:assert/strict';
import test, { after, before, mock } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { generateCsrfToken } from '../middleware/csrf.js';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'isolated-backup-route-test-key';
const { default: pool } = await import('../config/database.js');
const { createBackupsRouter } = await import('./backups.js');
const { default: adminRouter } = await import('./admin.js');
const roles = ['customer', 'store_staff', 'owner', 'super_admin', 'cashier'];
const id = '00000000-0000-4000-8000-000000000001';
let serviceCalls = 0;
const auditValues = [];
const rateCounts = new Map();
const service = {
  async list() { serviceCalls++; return []; }, async status() { serviceCalls++; return { configured: false }; },
  async request() { serviceCalls++; return { backup: { id, status: 'queued' }, completion: Promise.resolve() }; },
  async download() { serviceCalls++; return { url: 'https://private.example.test/short-lived', expires_in: 60 }; },
  async delete() { serviceCalls++; },
};
const settings = new Map([['security.password_min_length', '8'], ['security.max_login_attempts', '5'], ['security.smtp_password', 'hidden-secret']]);
let restoreCalls = 0;
const restoreService = {
  async overview() { return { restore_configured: true }; },
  async request() { restoreCalls++; return { id, backup_id: id, status: 'queued' }; },
  async status() { restoreCalls++; return { id, backup_id: id, status: 'queued' }; },
};
const app = express(); app.use(express.json());
app.use((req, _res, next) => {
  if (req.headers['x-test-session'] === 'true') {
    req.sessionID = 'isolated-restore-session';
    req.session = { auth: { userId: 4, tokenHash: 'isolated-session-hash' }, save(callback) { callback(); } };
  }
  next();
});
app.get('/test-csrf', generateCsrfToken, (req, res) => res.json({ token: req.csrfToken }));
app.use('/backups', createBackupsRouter(() => service, () => restoreService)); app.use('/admin', adminRouter);
let server;
let base;
before(async () => {
  mock.method(pool, 'query', async (sql, args = []) => {
    if (sql.includes('INSERT INTO request_rate_limits')) {
      const count = (rateCounts.get(args[0]) || 0) + 1; rateCounts.set(args[0], count);
      return { rows: [{ request_count: count, retry_after_seconds: 3600 }] };
    }
    if (sql.includes('SELECT id FROM sessions')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM users WHERE id')) return { rows: [{ id: args[0], role: roles[args[0] - 1], is_active: true, email_verified: true, is_deleted: false }] };
    if (sql.includes('SELECT key, value FROM system_settings')) return { rows: [...settings].filter(([key]) => key.startsWith('security.')).map(([key, value]) => ({ key: key.split('.')[1], value })) };
    if (sql.includes('SELECT * FROM system_settings')) return { rows: [...settings].map(([key, value]) => ({ category: key.split('.')[0], key: key.split('.')[1], value })) };
    if (sql.includes('INSERT INTO system_settings')) {
      if (sql.includes("VALUES ('security'")) settings.set(`security.${args[0]}`, args[1]);
      else settings.set(`${args[0]}.${args[1]}`, args[2]);
    }
    if (sql.includes('INSERT INTO audit_logs')) auditValues.push(JSON.stringify(args));
    return { rows: [], rowCount: 1 };
  });
  mock.method(pool, 'connect', async () => ({ query: (...args) => pool.query(...args), release() {} }));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); await pool.end(); });
const call = async (role, path, method = 'GET', body, headers = {}) => {
  const token = jwt.sign({ id: roles.indexOf(role) + 1, role }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: process.env.JWT_ISSUER || '10th-west-moto-api', audience: process.env.JWT_AUDIENCE || '10th-west-moto-web' });
  return fetch(`${base}${path}`, { method, headers: { ...(role ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
};

test('restore request/status deny unauthenticated and non-Super-Admin access; restore requires cookie session and CSRF', async () => {
  for (const [path, method] of [[`/backups/${id}/restore`, 'POST'], [`/backups/restores/${id}`, 'GET']]) {
    assert.equal((await call(null, path, method)).status, 401);
    for (const role of roles.filter(role => role !== 'super_admin')) assert.equal((await call(role, path, method)).status, 403);
  }
  const payload = { confirmation: 'RESTORE', acknowledgement: true, password: 'ephemeral-test-password' };
  assert.equal((await call('super_admin', `/backups/${id}/restore`, 'POST', payload)).status, 401);
  assert.equal((await call('super_admin', `/backups/${id}/restore`, 'POST', payload, { 'x-test-session': 'true' })).status, 403);
  const csrf = await (await call('super_admin', '/test-csrf', 'GET', null, { 'x-test-session': 'true' })).json();
  const accepted = await call('super_admin', `/backups/${id}/restore`, 'POST', payload, { 'x-test-session': 'true', 'x-csrf-token': csrf.token });
  assert.equal(accepted.status, 202);
  assert.equal((await call('super_admin', `/backups/restores/${id}`)).status, 200);
  assert.equal((await call('super_admin', `/backups/${id}/restore`, 'POST', payload, { 'x-test-session': 'true', 'x-csrf-token': csrf.token })).status, 429);
  assert.equal(restoreCalls, 2);
});

test('every backup endpoint authenticates and denies Customer, Staff and Owner while allowing only Super Admin', async () => {
  for (const [method, path] of [['GET','/backups'],['GET','/backups/status'],['POST','/backups'],['GET',`/backups/${id}/download`],['DELETE',`/backups/${id}`]]) {
    assert.equal((await call(null, path, method)).status, 401);
    for (const role of roles.filter(role => role !== 'super_admin')) {
      const before = serviceCalls;
      assert.equal((await call(role, path, method)).status, 403);
      assert.equal(serviceCalls, before);
    }
    const result = await call('super_admin', path, method);
    assert.equal(result.status, method === 'POST' ? 202 : 200);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
});

test('security policies save/load without secret masking; unsupported secrets and nested payloads are rejected', async () => {
  const result = await call('super_admin', '/admin/security/settings', 'PUT', { settings: { password_min_length: '12', max_login_attempts: '6' } });
  assert.equal(result.status, 200);
  const loaded = await (await call('super_admin', '/admin/security/settings')).json();
  assert.equal(loaded.password_min_length, '12');
  assert.equal(loaded.smtp_password, '********');
  assert.equal((await call('super_admin', '/admin/security/settings', 'PUT', { settings: { settings: {} } })).status, 400);
  assert.equal((await call('super_admin', '/admin/settings', 'PUT', { category: 'security', settings: { smtp_password: 'never-store' } })).status, 400);
  assert.equal((await call('owner', '/admin/security/settings')).status, 403);
  assert.equal((await call('owner', '/admin/settings/security')).status, 403);
  assert.equal((await call('owner', '/admin/settings/security/')).status, 403);
  assert.equal((await call('owner', '/admin/settings/%73ecurity')).status, 403);
  assert.equal(auditValues.some(value => value.includes('hidden-secret')), false);
});

test('configuration saves, validates and persists values through the existing settings API', async () => {
  assert.equal((await call('super_admin', '/admin/settings', 'PUT', { category: 'store', settings: { name: 'Isolated test shop' } })).status, 200);
  const loaded = await (await call('super_admin', '/admin/settings')).json();
  assert.equal(loaded.find(row => row.category === 'store' && row.key === 'name').value, 'Isolated test shop');
  assert.equal(loaded.find(row => row.key === 'password_min_length').value, '12');
  assert.equal((await call('super_admin', '/admin/settings', 'PUT', { category: 'shipping', settings: { flat_rate: '-5' } })).status, 400);
});
