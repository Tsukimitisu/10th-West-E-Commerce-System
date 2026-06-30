import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { authenticateToken } from './auth.js';

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

test('protected auth fails closed when database validation is unavailable', async () => {
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
    assert.equal(res.body.code, 'AUTH_SERVICE_UNAVAILABLE');
    assert.equal(req.user, undefined);
  } finally {
    pool.query = originalQuery;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
