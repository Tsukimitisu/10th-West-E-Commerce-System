import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
import bcrypt from 'bcryptjs';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/profile_auth_test';
process.env.DB_READ_MODE = 'postgres';

const { default: pool } = await import('../config/database.js');
const { updateProfile } = await import('./userController.js');
const { deleteAccountHandler } = await import('./authController.js');

afterEach(() => mock.restoreAll());
after(() => pool.end().catch(() => {}));

const response = () => ({
  statusCode: 200,
  body: null,
  clearedCookie: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  clearCookie(name, options) { this.clearedCookie = { name, options }; },
});

test('an active user can request an email change without replacing the primary email early', async () => {
  const current = {
    id: 7, name: 'Active Rider', email: 'old@gmail.com', role: 'customer', phone: '+639123456789',
    avatar: null, store_credit: 0, created_at: new Date(), is_active: true,
  };
  const client = {
    release() {},
    async query(sql, params = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM users') && text.includes('FOR UPDATE')) return { rows: [current] };
      if (text.includes('SELECT id FROM users WHERE LOWER(email)')) return { rows: [] };
      if (text.includes('SET name = $1') && text.includes('pending_email')) {
        return { rows: [{ ...current, name: params[0], phone: params[1], pending_email: params[3] }] };
      }
      throw new Error(`Unexpected profile query: ${text}`);
    },
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'gmail-smtp-in.l.google.com' }]);
  const sendMail = mock.fn(async () => ({ messageId: 'email-change' }));
  mock.method(nodemailer, 'createTransport', () => ({ sendMail }));
  const res = response();

  await updateProfile({
    user: { id: 7 },
    body: { name: 'Active Rider', email: 'new@gmail.com', phone: '639123456789' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.requiresEmailVerification, true);
  assert.equal(res.body.pending_email, 'new@gmail.com');
  assert.equal(res.body.user.email, 'old@gmail.com');
  assert.equal(res.body.user.phone, '+639123456789');
  assert.equal(res.body.message, 'Email change request sent. Please verify your new email.');
  assert.equal(sendMail.mock.callCount(), 1);
});

test('a Google-managed primary email cannot be changed through the profile API', async () => {
  const current = {
    id: 8, name: 'Google Rider', email: 'rider@gmail.com', role: 'customer', phone: null,
    avatar: null, store_credit: 0, created_at: new Date(), google_email_managed: true,
  };
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM users') && text.includes('FOR UPDATE')) return { rows: [current] };
      throw new Error(`Unexpected profile query: ${text}`);
    },
  };
  mock.method(pool, 'connect', async () => client);
  const res = response();

  await updateProfile({
    user: { id: 8 },
    body: { name: 'Google Rider', email: 'bypass@example.net', phone: '' },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'GOOGLE_LINKED_EMAIL_READ_ONLY');
  assert.equal(res.body.fieldErrors.email, 'Your email address is linked to your Google account and cannot be changed here.');
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(queries.some((sql) => sql.includes('UPDATE users')), false);
});

test('a Google-linked user can update unrelated profile fields without rewriting email', async () => {
  const current = {
    id: 8, name: 'Google Rider', email: 'rider@gmail.com', role: 'customer', phone: null,
    avatar: null, store_credit: 0, created_at: new Date(), google_email_managed: true,
  };
  const queries = [];
  const client = {
    release() {},
    async query(sql, params = []) {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM users') && text.includes('FOR UPDATE')) return { rows: [current] };
      if (text.includes('UPDATE users')) {
        return { rows: [{ ...current, name: params[0], phone: params[1] }] };
      }
      throw new Error(`Unexpected profile query: ${text}`);
    },
  };
  mock.method(pool, 'connect', async () => client);
  const res = response();

  await updateProfile({
    user: { id: 8 },
    body: { name: 'Updated Google Rider', email: 'rider@gmail.com', phone: '09123456789' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.name, 'Updated Google Rider');
  assert.equal(res.body.user.phone, '+639123456789');
  const updateQuery = queries.find((sql) => sql.includes('UPDATE users'));
  assert.ok(updateQuery);
  assert.doesNotMatch(updateQuery, /email\s*=/i);
});

test('Google-linked account with a correct local password is anonymized transactionally', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123!', 4);
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      const text = String(sql);
      queries.push(text);
      if (text.includes('SELECT password_hash, oauth_provider')) {
        return { rows: [{ password_hash: passwordHash, oauth_provider: 'google', email: 'rider@gmail.com', is_active: true, is_deleted: false }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));
  let sessionDestroyed = false;
  const res = response();

  await deleteAccountHandler({
    user: { id: 9 },
    body: { confirmation: 'DELETE', password: 'CorrectPassword123!' },
    clientIp: '127.0.0.1', clientUa: 'test',
    session: { destroy(callback) { sessionDestroyed = true; callback(); } },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /Account deleted/);
  assert.equal(queries[0], 'BEGIN');
  assert.ok(queries.includes('COMMIT'));
  assert.ok(queries.some((sql) => sql.includes("name = 'Deleted User'")));
  assert.ok(queries.some((sql) => sql.includes('is_deleted = true')));
  assert.equal(queries.some((sql) => sql.includes('deleted_at')), false);
  assert.ok(queries.some((sql) => sql.includes('UPDATE sessions SET is_active = false')));
  assert.equal(queries.some((sql) => /DELETE FROM (orders|payments|shipments)/.test(sql)), false);
  assert.equal(sessionDestroyed, true);
  assert.equal(res.clearedCookie.name, 'twm.sid');
});

test('incorrect local password rolls account deletion back without anonymizing the account', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123!', 4);
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      const text = String(sql);
      queries.push(text);
      if (text.includes('SELECT password_hash, oauth_provider')) {
        return { rows: [{ password_hash: passwordHash, oauth_provider: 'google', email: 'rider@gmail.com', is_active: true, is_deleted: false }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  mock.method(pool, 'connect', async () => client);
  const res = response();

  await deleteAccountHandler({
    user: { id: 9 }, body: { confirmation: 'DELETE', password: 'WrongPassword123!' },
    clientIp: '127.0.0.1', clientUa: 'test',
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Incorrect password');
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(queries.some((sql) => sql.includes('UPDATE users')), false);
});

test('wrong confirmation text rejects account deletion before database changes', async () => {
  const connect = mock.fn(async () => { throw new Error('database must not be reached'); });
  mock.method(pool, 'connect', connect);
  const res = response();

  await deleteAccountHandler({
    user: { id: 9 }, body: { confirmation: 'delete', password: 'CorrectPassword123!' },
    clientIp: '127.0.0.1', clientUa: 'test',
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Type DELETE to confirm account deletion');
  assert.equal(connect.mock.callCount(), 0);
});

test('OAuth-only account deletion requires a recent authenticated provider session', async () => {
  const run = async (authenticatedAt) => {
    const queries = [];
    const client = {
      release() {},
      async query(sql) {
        const text = String(sql);
        queries.push(text);
        if (text.includes('SELECT password_hash, oauth_provider')) {
          return { rows: [{ password_hash: null, oauth_provider: 'google', email: 'rider@gmail.com', is_active: true, is_deleted: false }] };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    mock.method(pool, 'connect', async () => client);
    mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));
    const res = response();
    await deleteAccountHandler({
      user: { id: 9 }, body: { confirmation: 'DELETE' }, clientIp: '127.0.0.1', clientUa: 'test',
      session: { auth: { authenticatedAt }, destroy(callback) { callback(); } },
    }, res);
    mock.restoreAll();
    return { queries, res };
  };

  const recent = await run(Date.now());
  assert.equal(recent.res.statusCode, 200);
  assert.ok(recent.queries.includes('COMMIT'));

  const stale = await run(Date.now() - (20 * 60 * 1000));
  assert.equal(stale.res.statusCode, 403);
  assert.equal(stale.res.body.code, 'OAUTH_REAUTH_REQUIRED');
  assert.ok(stale.queries.includes('ROLLBACK'));
  assert.equal(stale.queries.some((sql) => sql.includes('UPDATE users')), false);
});

test('account deletion rolls back all changes when anonymization fails', async () => {
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      const text = String(sql);
      queries.push(text);
      if (text.includes('SELECT password_hash, oauth_provider')) {
        return { rows: [{ password_hash: null, oauth_provider: 'google', email: 'rider@gmail.com', is_active: true, is_deleted: false }] };
      }
      if (text.includes('UPDATE users')) throw Object.assign(new Error('forced failure'), { code: '23514' });
      return { rows: [], rowCount: 1 };
    },
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(console, 'error', () => {});
  const res = response();

  await deleteAccountHandler({
    user: { id: 9 }, body: { confirmation: 'DELETE' }, clientIp: '127.0.0.1', clientUa: 'test',
    session: { auth: { authenticatedAt: Date.now() } },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'ACCOUNT_DELETION_FAILED');
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(queries.includes('COMMIT'), false);
});

test('account deletion route keeps authentication, CSRF middleware coverage, and optional OAuth password confirmation', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../routes/auth.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("router.delete('/account'"), source.indexOf('Data export'));
  assert.match(route, /authenticateToken/);
  assert.match(route, /body\('confirmation'\)\.equals\('DELETE'\)/);
  assert.match(route, /body\('password'\)\.optional/);
});
