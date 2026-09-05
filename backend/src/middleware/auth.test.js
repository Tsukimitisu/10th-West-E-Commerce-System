import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';

const { default: pool } = await import('../config/database.js');
const { authenticateOptional, authenticateToken } = await import('./auth.js');

const DATABASE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

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

test('protected auth returns the shared database outage contract', async () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-auth-fail-closed';
  const token = jwt.sign(
    { id: 1, email: 'admin@example.com', role: 'super_admin' },
    process.env.JWT_SECRET,
    {
      expiresIn: '1h',
      issuer: process.env.JWT_ISSUER || '10th-west-moto-api',
      audience: process.env.JWT_AUDIENCE || '10th-west-moto-web',
    },
  );

  const originalQuery = pool.query;
  pool.query = async () => {
    const error = new Error('connection timeout');
    error.code = 'ETIMEDOUT';
    throw error;
  };

  const req = {
    headers: { authorization: `Bearer ${token}` },
    session: {},
  };
  const res = makeResponse();
  let nextCalled = false;

  try {
    await authenticateToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(res.body.message, DATABASE_UNAVAILABLE_MESSAGE);
    assert.equal(req.user, undefined);
  } finally {
    pool.query = originalQuery;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});

test('session authentication returns 503 instead of a generic 500 when the database is unavailable', async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    const error = new Error('Tenant or user not found');
    error.code = 'XX000';
    throw error;
  };

  const req = {
    headers: {},
    session: {
      auth: {
        userId: 1,
        role: 'customer',
        tokenHash: 'a'.repeat(64),
      },
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  try {
    await authenticateToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      message: DATABASE_UNAVAILABLE_MESSAGE,
      code: 'DATABASE_UNAVAILABLE',
    });
  } finally {
    pool.query = originalQuery;
  }
});

test('optional session authentication does not silently downgrade a database outage to guest access', async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    const error = new Error('password authentication failed for database user');
    error.code = '28P01';
    throw error;
  };

  const req = {
    headers: {},
    session: {
      auth: {
        userId: 1,
        role: 'customer',
        tokenHash: 'b'.repeat(64),
      },
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  try {
    await authenticateOptional(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(res.body.message, DATABASE_UNAVAILABLE_MESSAGE);
  } finally {
    pool.query = originalQuery;
  }
});
