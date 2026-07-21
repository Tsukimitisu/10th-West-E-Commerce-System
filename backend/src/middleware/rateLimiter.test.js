import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';

const { default: pool } = await import('../config/database.js');
const { default: rateLimit } = await import('./rateLimiter.js');

after(async () => {
  await pool.end().catch(() => {});
});

const makeResponse = () => ({
  statusCode: null,
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

test('database-backed rate limiter fails closed with the database outage contract', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const originalQuery = pool.query;
  pool.query = async () => {
    const error = new Error('connect ECONNREFUSED');
    error.code = 'ECONNREFUSED';
    throw error;
  };

  const limiter = rateLimit(60000, 1, { storage: 'db' });
  const req = { method: 'POST', baseUrl: '/api/auth', path: '/login', ip: '127.0.0.1', body: { email: 'qa@example.com' } };
  const res = makeResponse();
  let nextCalled = false;

  try {
    await limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(res.body.message, 'The service is temporarily unavailable. Please try again later.');
  } finally {
    pool.query = originalQuery;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('database-backed rate limiter relies on migrations and does not run schema DDL', async () => {
  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql) => {
    statements.push(String(sql));
    return {
      rows: [{ request_count: 1, retry_after_seconds: 60 }],
      rowCount: 1,
    };
  };

  const limiter = rateLimit(60000, 2, { storage: 'db' });
  const req = { method: 'POST', baseUrl: '/api/auth', path: '/login', ip: '127.0.0.1', body: { email: 'qa@example.com' } };
  const res = makeResponse();
  let nextCalled = false;

  try {
    await limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(statements.length, 1);
    assert.match(statements[0], /INSERT INTO request_rate_limits/);
    assert.doesNotMatch(statements[0], /CREATE\s+(TABLE|INDEX)/i);
  } finally {
    pool.query = originalQuery;
  }
});
