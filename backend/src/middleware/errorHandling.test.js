import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';

const { default: pool } = await import('../config/database.js');
const { errorHandler } = await import('./errorHandler.js');
const { errorLogger } = await import('./errorLogger.js');

const DATABASE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

afterEach(() => {
  mock.restoreAll();
});

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

test('global handler sanitizes database errors and all production 503 responses', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const secretMarker = 'FAKE_DATABASE_SECRET_MARKER';
  const logged = [];
  mock.method(console, 'error', (...args) => logged.push(args));

  try {
    const databaseError = Object.assign(
      new Error(`password authentication failed at postgresql://user:${secretMarker}@db.invalid/postgres`),
      { code: '28P01', status: 503 }
    );
    const databaseResponse = makeResponse();
    errorHandler(databaseError, { method: 'POST', originalUrl: '/api/auth/login' }, databaseResponse, () => {});

    assert.equal(databaseResponse.statusCode, 503);
    assert.deepEqual(databaseResponse.body, {
      message: DATABASE_UNAVAILABLE_MESSAGE,
      code: 'DATABASE_UNAVAILABLE',
    });

    const genericResponse = makeResponse();
    errorHandler(
      Object.assign(new Error(`upstream detail ${secretMarker}`), { status: 503 }),
      { method: 'POST', originalUrl: '/api/auth/login' },
      genericResponse,
      () => {}
    );
    assert.equal(genericResponse.statusCode, 503);
    assert.deepEqual(genericResponse.body, { message: DATABASE_UNAVAILABLE_MESSAGE });

    assert.doesNotMatch(JSON.stringify([databaseResponse.body, genericResponse.body, logged]), new RegExp(secretMarker));
    assert.doesNotMatch(JSON.stringify(logged), /postgresql:\/\//i);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('database error logger persists only sanitized fields and omits URL/body/query values', async () => {
  const secretMarker = 'FAKE_REQUEST_SECRET_MARKER';
  let capturedParams = null;
  mock.method(pool, 'query', async (_sql, params) => {
    capturedParams = params;
    return { rows: [], rowCount: 1 };
  });

  let nextError = null;
  const error = new Error(`unexpected application failure ${secretMarker}`);
  await errorLogger(
    error,
    {
      method: 'POST',
      originalUrl: `/api/auth/login?token=${secretMarker}`,
      path: '/api/auth/login',
      query: { token: secretMarker },
      body: { email: 'rider@example.test', password: secretMarker },
      ip: '127.0.0.1',
    },
    {},
    (forwardedError) => { nextError = forwardedError; }
  );

  assert.equal(nextError, error);
  assert.ok(capturedParams, 'expected a sanitized error log insert');
  assert.doesNotMatch(JSON.stringify(capturedParams), new RegExp(secretMarker));
  assert.equal(capturedParams[2], null, 'raw stack traces must not be persisted');
  assert.equal(capturedParams[3], 'POST /api/auth/login');
  assert.deepEqual(JSON.parse(capturedParams[6]), {
    queryFields: ['token'],
    bodyFields: ['email', 'password'],
  });
});
