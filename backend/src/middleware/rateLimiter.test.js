import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import rateLimit from './rateLimiter.js';

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

test('database-backed rate limiter fails closed in production when storage is unavailable', async () => {
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
    assert.equal(res.body.code, 'RATE_LIMIT_UNAVAILABLE');
  } finally {
    pool.query = originalQuery;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
