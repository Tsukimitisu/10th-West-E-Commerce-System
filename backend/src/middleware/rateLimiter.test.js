import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';

const { default: pool } = await import('../config/database.js');
const { default: rateLimit, phoneRecoveryLimiter, phoneRecoveryVerifyLimiter } = await import('./rateLimiter.js');

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

test('phone recovery and verification reuse persistent limits with hashed canonical identifiers and safe 429s', async () => {
  const original = pool.query, counts = new Map();
  pool.query = async (_sql, params) => {
    const count = (counts.get(params[0]) || 0) + 1; counts.set(params[0], count);
    assert.match(params[0], /^[a-f0-9]{64}$/);
    return { rows: [{ request_count: count, retry_after_seconds: 60 }] };
  };
  try {
    let allowed = 0;
    for (const phone of ['09123456789', '+639123456789', '639123456789', '09123456789']) {
      const res = makeResponse();
      await phoneRecoveryLimiter({ ip: '192.0.2.100', body: { phone } }, res, () => allowed++);
      if (allowed === 3 && res.statusCode) { assert.equal(res.statusCode, 429); assert.doesNotMatch(JSON.stringify(res.body), /639123|account|registered/); }
    }
    assert.equal(allowed, 3); assert.equal(counts.size, 1);
    for (let i = 0; i < 11; i++) await phoneRecoveryVerifyLimiter({ ip: '192.0.2.100', body: { phone: '09123456789' } }, makeResponse(), () => allowed++);
    assert.equal(allowed, 13); assert.equal(counts.size, 2);
  } finally { pool.query = original; }
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
  const parameters = [];
  pool.query = async (sql, params) => {
    statements.push(String(sql));
    parameters.push(params);
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
    assert.equal(parameters[0][0], createHash('sha256').update('POST:/api/auth/login:127.0.0.1').digest('hex'));
  } finally {
    pool.query = originalQuery;
  }
});

test('rate-limit namespaces isolate repeated automated runs without changing limits', async () => {
  const originalQuery = pool.query;
  const previousNamespace = process.env.RATE_LIMIT_NAMESPACE;
  let storedKey;
  pool.query = async (_sql, params) => {
    [storedKey] = params;
    return {
      rows: [{ request_count: 1, retry_after_seconds: 60 }],
      rowCount: 1,
    };
  };
  process.env.RATE_LIMIT_NAMESPACE = 'e2e/run unsafe';

  const limiter = rateLimit(60000, 2, { storage: 'db' });
  const req = { method: 'POST', baseUrl: '/api/auth', path: '/login', ip: '127.0.0.1', body: { email: 'qa@example.com' } };
  const res = makeResponse();

  try {
    await limiter(req, res, () => {});
    assert.equal(storedKey, 'e2e_run_unsafe:' + createHash('sha256').update('POST:/api/auth/login:127.0.0.1').digest('hex'));
  } finally {
    pool.query = originalQuery;
    if (previousNamespace === undefined) delete process.env.RATE_LIMIT_NAMESPACE;
    else process.env.RATE_LIMIT_NAMESPACE = previousNamespace;
  }
});


test('limits return 429, keep reset tokens out of storage, and fail closed on internal errors', async () => {
  const originalQuery = pool.query;
  let count = 0, stored;
  pool.query = async (_sql, params) => { stored = params[0]; return { rows: [{ request_count: ++count, retry_after_seconds: 30 }] }; };
  try {
    const limiter = rateLimit(60000, 1, { storage: 'db', keyGenerator: () => 'private-reset-token:private@example.test' });
    let allowed = 0;
    await limiter({}, makeResponse(), () => { allowed++; });
    const denied = makeResponse(); await limiter({}, denied, () => { allowed++; });
    assert.equal(allowed, 1); assert.equal(denied.statusCode, 429);
    assert.match(stored, /^[a-f0-9]{64}$/); assert.doesNotMatch(stored, /private-reset-token|private@example/);
    const broken = rateLimit(60000, 1, { keyGenerator: () => { throw new Error('bad key generator'); } });
    const unavailable = makeResponse(); await broken({}, unavailable, () => assert.fail('must fail closed'));
    assert.equal(unavailable.statusCode, 503);
  } finally { pool.query = originalQuery; }
});


test('production default limiter uses persistent storage', async () => {
  const originalQuery = pool.query, originalEnv = process.env.NODE_ENV;
  let persisted = false;
  process.env.NODE_ENV = 'production';
  pool.query = async sql => { persisted = String(sql).includes('INSERT INTO request_rate_limits'); return { rows: [{ request_count: 2, retry_after_seconds: 30 }] }; };
  try {
    const limiter = rateLimit(60000, 1);
    const res = makeResponse(); await limiter({ method: 'GET', path: '/health' }, res, () => assert.fail('limit must reject'));
    assert.equal(persisted, true); assert.equal(res.statusCode, 429);
  } finally { pool.query = originalQuery; process.env.NODE_ENV = originalEnv; }
});
