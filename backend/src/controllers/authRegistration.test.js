import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, afterEach, mock } from 'node:test';
import dns from 'dns/promises';
import nodemailer from 'nodemailer';
import pool from '../config/database.js';
import { validate } from '../middleware/validator.js';
import { registerValidation } from '../routes/auth.js';
import { register } from './authController.js';

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await pool.end().catch(() => {});
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(directory, '..', '..', '..');

const validRegistrationBody = {
  name: 'Jane Rider',
  email: 'jane.rider@gmail.com',
  password: 'StrongPass123',
  confirmPassword: 'StrongPass123',
  consent_given: true,
  age_confirmed: true,
};

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

const runRegisterValidation = async (body) => {
  const req = { body: { ...body } };
  const res = makeResponse();
  let nextCalled = false;

  for (const rule of registerValidation) {
    await rule.run(req);
  }

  validate(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
};

const makeRegisterClient = ({ existingRows = [] } = {}) => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      const trimmed = text.trim();
      calls.push({ sql: text, params });

      if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('SELECT id, name, email, email_verified FROM users')) {
        return { rows: existingRows, rowCount: existingRows.length };
      }

      if (text.includes('INSERT INTO users')) {
        return {
          rows: [{ id: 42, name: params[0], email: params[1] }],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected query in registration test: ${text}`);
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    },
  };

  return { client, calls };
};

const installRegisterMocks = (client) => {
  mock.method(pool, 'connect', async () => client);
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.gmail.com', priority: 1 }]);
  const sendMail = mock.fn(async () => ({ messageId: 'registration-test' }));
  mock.method(nodemailer, 'createTransport', () => ({ sendMail }));
  return { sendMail };
};

test('register validation returns a clear message when email is missing', async () => {
  const { res, nextCalled } = await runRegisterValidation({
    ...validRegistrationBody,
    email: '',
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Please enter a valid email address');
  assert.equal(res.body.fieldErrors.email, 'Please enter a valid email address');
});

test('register validation returns a clear message when password is weak', async () => {
  const { res, nextCalled } = await runRegisterValidation({
    ...validRegistrationBody,
    password: 'weakpass',
    confirmPassword: 'weakpass',
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.fieldErrors.password,
    'Password must be at least 8 characters and include uppercase, lowercase, and a number'
  );
});

test('register validation accepts frontend-valid long email addresses', async () => {
  const email = 'registration-smoke-2ebbd62663bd460b92886646bc9f57ed@gmail.com';
  const { req, res, nextCalled } = await runRegisterValidation({
    ...validRegistrationBody,
    email,
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.validatedData.email, email);
});

test('register creates a customer account without exposing password hashes', async () => {
  const { client, calls } = makeRegisterClient();
  const { sendMail } = installRegisterMocks(client);
  const req = {
    validatedData: {
      name: 'Jane Rider',
      email: 'jane.rider@gmail.com',
      password: 'StrongPass123',
      consent_given: true,
      age_confirmed: true,
    },
  };
  const res = makeResponse();

  await register(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.requiresVerification, true);
  assert.equal(res.body.email, 'jane.rider@gmail.com');
  assert.doesNotMatch(JSON.stringify(res.body), /password(?:_hash|Hash)?/i);
  assert.equal(sendMail.mock.callCount(), 1);

  const insertCall = calls.find((call) => call.sql.includes('INSERT INTO users'));
  assert.ok(insertCall, 'expected user insert query');
  assert.match(insertCall.sql, /'customer'/);
  assert.doesNotMatch(insertCall.sql, /RETURNING[\s\S]*password_hash/i);
});

test('register returns a clear duplicate email message for existing verified accounts', async () => {
  const { client, calls } = makeRegisterClient({
    existingRows: [{ id: 9, name: 'Existing Rider', email: 'jane.rider@gmail.com', email_verified: true }],
  });
  installRegisterMocks(client);
  const req = {
    validatedData: {
      name: 'Jane Rider',
      email: 'jane.rider@gmail.com',
      password: 'StrongPass123',
      consent_given: true,
      age_confirmed: true,
    },
  };
  const res = makeResponse();

  await register(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, 'Email already in use.');
  assert.equal(res.body.fieldErrors.email, 'This email is already in use.');
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO users')), false);
});

test('frontend register sends password confirmation through the CSRF-protected API helper', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend', 'services', 'api.js'), 'utf8');
  const registerFunction = source.slice(
    source.indexOf('export const register = async'),
    source.indexOf('const getAddressZipError')
  );

  assert.match(registerFunction, /authenticatedFetch\(`\$\{API_URL\}\/auth\/register`/);
  assert.match(registerFunction, /password/);
  assert.match(registerFunction, /confirmPassword/);
  assert.doesNotMatch(registerFunction, /skipCsrf\s*:\s*true/);
  assert.match(source, /headers\['x-csrf-token'\]\s*=\s*csrfToken/);
  assert.match(source, /credentials:\s*'include'/);
});
