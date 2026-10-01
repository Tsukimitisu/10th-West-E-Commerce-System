import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCsrfToken, validateCsrf } from './csrf.js';

const issueToken = async (sessionID) => {
  const request = {
    sessionID,
    session: {
      save(callback) { callback(); },
    },
    headers: {},
    ip: '127.0.0.1',
  };
  let cookie;
  const response = {
    setHeader() {},
    cookie(name, value, options) { cookie = { name, value, options }; },
  };

  await new Promise((resolve, reject) => {
    generateCsrfToken(request, response, (error) => (error ? reject(error) : resolve()));
  });
  return { token: request.csrfToken, cookie };
};

const validateToken = (sessionID, token) => {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  const request = {
    method: 'POST',
    path: '/auth/login',
    sessionID,
    headers: { 'x-csrf-token': token },
    body: {},
    ip: '127.0.0.1',
  };
  const response = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  validateCsrf(request, response, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
};

test('issued CSRF token validates only against the same cookie-backed session', async () => {
  const { token, cookie } = await issueToken('session-a');
  assert.ok(token);
  assert.equal(cookie.name, 'csrf-token');
  assert.equal(cookie.value, token);

  assert.deepEqual(validateToken('session-a', token), {
    nextCalled: true,
    statusCode: 200,
    body: undefined,
  });
  assert.deepEqual(validateToken('session-b', token), {
    nextCalled: false,
    statusCode: 403,
    body: {
      message: 'Invalid CSRF token',
      code: 'CSRF_INVALID_TOKEN',
    },
  });
});
