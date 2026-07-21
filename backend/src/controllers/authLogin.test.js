import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE = 'postgres';

const { default: pool } = await import('../config/database.js');
const { login } = await import('./authController.js');

const DATABASE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await pool.end().catch(() => {});
});

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeRequest = (password = 'WrongPassword123!') => ({
  validatedData: {
    email: 'rider@example.test',
    password,
  },
  clientIp: '127.0.0.1',
  clientUa: 'auth-login-test',
  session: {},
});

test('healthy database wrong password returns exact INVALID_CREDENTIALS contract', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123!', 4);
  mock.method(pool, 'query', async (sql) => {
    const text = String(sql);
    if (text.includes('SELECT COUNT(*)')) return { rows: [{ cnt: '0' }] };
    if (text.includes('SELECT * FROM users')) {
      return {
        rows: [{
          id: 17,
          email: 'rider@example.test',
          role: 'customer',
          password_hash: passwordHash,
          is_active: true,
          is_deleted: false,
          email_verified: true,
        }],
      };
    }
    if (text.includes('INSERT INTO login_attempts')) return { rows: [], rowCount: 1 };
    throw new Error('Unexpected query in wrong-password test');
  });

  const res = makeResponse();
  await login(makeRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    message: 'Invalid email or password',
    code: 'INVALID_CREDENTIALS',
  });
  assert.doesNotMatch(JSON.stringify(res.body), /password_hash|CorrectPassword|WrongPassword/i);
});

test('healthy database missing user returns the same INVALID_CREDENTIALS contract', async () => {
  mock.method(pool, 'query', async (sql) => {
    const text = String(sql);
    if (text.includes('SELECT COUNT(*)')) return { rows: [{ cnt: '0' }] };
    if (text.includes('SELECT * FROM users')) return { rows: [] };
    if (text.includes('INSERT INTO login_attempts')) return { rows: [], rowCount: 1 };
    throw new Error('Unexpected query in missing-user test');
  });

  const res = makeResponse();
  await login(makeRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  assert.equal(res.body.message, 'Invalid email or password');
});

test('database tenant outage returns sanitized 503 and never falls back to REST login', async () => {
  const secretMarker = 'FAKE_DATABASE_SECRET_MARKER';
  const databaseError = Object.assign(
    new Error(`Tenant or user not found at postgresql://user:${secretMarker}@db.invalid/postgres`),
    { code: 'XX000' }
  );
  const logged = [];
  const fetchMock = mock.fn(async () => {
    throw new Error('REST login must not be called');
  });

  mock.method(pool, 'query', async () => {
    throw databaseError;
  });
  mock.method(console, 'error', (...args) => logged.push(args));
  mock.method(globalThis, 'fetch', fetchMock);

  const res = makeResponse();
  await login(makeRequest(), res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: DATABASE_UNAVAILABLE_MESSAGE,
    code: 'DATABASE_UNAVAILABLE',
  });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.doesNotMatch(JSON.stringify(res.body), new RegExp(secretMarker));
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(secretMarker));
  assert.doesNotMatch(JSON.stringify(logged), /postgresql:\/\//i);
});
