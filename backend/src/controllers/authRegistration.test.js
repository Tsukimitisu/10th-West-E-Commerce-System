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
import { register, resendVerification, verifyEmailToken } from './authController.js';

const originalSmtpEnvironment = Object.fromEntries(
  ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']
    .map((name) => [name, process.env[name]])
);
process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.unit.test';
process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
process.env.SMTP_USER = process.env.SMTP_USER || 'unit-user';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'unit-password';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || '10th West Moto <noreply@unit.test>';

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  for (const [name, value] of Object.entries(originalSmtpEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
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

      if (text.includes('UPDATE users SET email_verification_sent_at')) {
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('SET email_verification_token')) {
        return { rows: [], rowCount: 1 };
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

test('registration mailer uses the documented SMTP environment variables', async () => {
  const environmentNames = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
    'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD',
  ];
  const previousEnvironment = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]])
  );

  process.env.SMTP_HOST = 'smtp.provider.test';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_USER = 'smtp-user';
  process.env.SMTP_PASS = 'smtp-password';
  delete process.env.EMAIL_HOST;
  delete process.env.EMAIL_PORT;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASSWORD;

  try {
    const { client } = makeRegisterClient();
    mock.method(pool, 'connect', async () => client);
    mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.gmail.com', priority: 1 }]);
    let transportOptions;
    mock.method(nodemailer, 'createTransport', (options) => {
      transportOptions = options;
      return { sendMail: async () => ({ messageId: 'smtp-config-test' }) };
    });

    const res = makeResponse();
    await register({
      validatedData: {
        name: 'Jane Rider', email: 'jane.rider@gmail.com', password: 'StrongPass123',
        consent_given: true, age_confirmed: true,
      },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(
      {
        host: transportOptions?.host,
        port: transportOptions?.port,
        secure: transportOptions?.secure,
        user: transportOptions?.auth?.user,
        pass: transportOptions?.auth?.pass,
      },
      {
        host: 'smtp.provider.test',
        port: 465,
        secure: true,
        user: 'smtp-user',
        pass: 'smtp-password',
      }
    );
  } finally {
    for (const name of environmentNames) {
      const value = previousEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('registration keeps the created account and returns resendable status when verification delivery fails', async () => {
  const { client, calls } = makeRegisterClient();
  mock.method(pool, 'connect', async () => client);
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.gmail.com', priority: 1 }]);
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('provider unavailable'); } }));
  const res = makeResponse();

  await register({
    validatedData: {
      name: 'Jane Rider', email: 'jane.rider@gmail.com', password: 'StrongPass123',
      consent_given: true, age_confirmed: true,
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.requiresVerification, true);
  assert.equal(res.body.verificationDelivery, 'failed');
  assert.match(res.body.message, /Account created.*resend verification/i);
  assert.ok(calls.some((call) => call.sql.includes('COMMIT')));
});

test('registration has bounded delivery and safe lifecycle logging', async () => {
  const source = await readFile(new URL('./authController.js', import.meta.url), 'utf8');
  for (const event of [
    'ACCOUNT_CREATE_START', 'ACCOUNT_CREATE_USER_CREATED', 'ACCOUNT_CREATE_VERIFICATION_SEND_START',
    'ACCOUNT_CREATE_VERIFICATION_SEND_SUCCESS', 'ACCOUNT_CREATE_VERIFICATION_SEND_FAILED', 'ACCOUNT_CREATE_DONE',
  ]) assert.match(source, new RegExp(event));
  assert.match(source, /VERIFICATION_DELIVERY_TIMEOUT_MS/);
  assert.match(source, /withTimeout\([\s\S]*sendVerificationEmail/);
  assert.doesNotMatch(source, /ACCOUNT_CREATE[^\n]*(password|token|otp)/i);
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

test('registration retry reuses the unverified account and replaces its token only after submission', async () => {
  const { client, calls } = makeRegisterClient({
    existingRows: [{ id: 9, name: 'Existing Rider', email: 'jane.rider@gmail.com', email_verified: false }],
  });
  const events = [];
  mock.method(pool, 'connect', async () => client);
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mail.gmail.com', priority: 1 }]);
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      events.push('submitted');
      return { messageId: 'registration-retry' };
    },
  }));
  const originalQuery = client.query.bind(client);
  client.query = async (sql, params = []) => {
    if (String(sql).includes('SET email_verification_token')) events.push('token-updated');
    return originalQuery(sql, params);
  };
  const res = makeResponse();

  await register({ validatedData: validRegistrationBody }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.requiresVerification, true);
  assert.deepEqual(events, ['submitted', 'token-updated']);
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO users')), false);
});

const makeResendClient = ({ user, updateError = null } = {}) => {
  const calls = [];
  return {
    calls,
    client: {
      async query(sql, params = []) {
        const text = String(sql);
        calls.push({ sql: text, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text.trim())) return { rows: [], rowCount: 0 };
        if (text.includes('FROM users') && text.includes('FOR UPDATE')) {
          return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
        }
        if (text.includes('SET email_verification_token')) {
          if (updateError) throw updateError;
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected resend query: ${text}`);
      },
      release() {
        calls.push({ sql: 'release', params: [] });
      },
    },
  };
};

test('resend submits the email before replacing the previous verification token', async () => {
  const events = [];
  const { client, calls } = makeResendClient({
    user: {
      id: 17, name: 'Unverified Rider', email: 'rider@gmail.com', email_verified: false,
      email_verification_sent_at: new Date(Date.now() - 120_000),
    },
  });
  const originalQuery = client.query.bind(client);
  client.query = async (sql, params = []) => {
    if (String(sql).includes('SET email_verification_token')) events.push('token-updated');
    return originalQuery(sql, params);
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async (message) => {
      events.push('submitted');
      assert.equal(message.to, 'rider@gmail.com');
      assert.match(message.html, /#\/verify-email\?token=[a-f0-9]{64}/);
      return { messageId: 'resend-success' };
    },
  }));
  const res = makeResponse();

  await resendVerification({ validatedData: { email: 'rider@gmail.com' } }, res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.message, 'Verification email request accepted.');
  assert.deepEqual(events, ['submitted', 'token-updated']);
  assert.ok(calls.some((call) => call.sql.trim() === 'COMMIT'));
});

test('resend provider failure preserves the previous verification token', async () => {
  const { client, calls } = makeResendClient({
    user: {
      id: 18, name: 'Unverified Rider', email: 'rider@gmail.com', email_verified: false,
      email_verification_sent_at: null,
    },
  });
  mock.method(pool, 'connect', async () => client);
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      const error = new Error('authentication failed for smtp-password');
      error.code = 'EAUTH';
      throw error;
    },
  }));
  const res = makeResponse();

  await resendVerification({ validatedData: { email: 'rider@gmail.com' } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'VERIFICATION_EMAIL_FAILED');
  assert.doesNotMatch(JSON.stringify(res.body), /smtp-password|EAUTH/);
  assert.equal(calls.some((call) => call.sql.includes('SET email_verification_token')), false);
  assert.ok(calls.some((call) => call.sql.trim() === 'ROLLBACK'));
});

test('resend enforces the account cooldown without contacting the provider', async () => {
  const { client } = makeResendClient({
    user: {
      id: 19, name: 'Unverified Rider', email: 'rider@gmail.com', email_verified: false,
      email_verification_sent_at: new Date(),
    },
  });
  mock.method(pool, 'connect', async () => client);
  const createTransport = mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => ({}) }));
  const res = makeResponse();

  await resendVerification({ validatedData: { email: 'rider@gmail.com' } }, res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'VERIFICATION_RESEND_COOLDOWN');
  assert.ok(res.body.retryAfter >= 1);
  assert.equal(createTransport.mock.callCount(), 0);
});

test('resend does not reveal whether an account is missing or already verified', async () => {
  for (const user of [null, {
    id: 20, name: 'Verified Rider', email: 'rider@gmail.com', email_verified: true,
    email_verification_sent_at: null,
  }]) {
    mock.restoreAll();
    const { client } = makeResendClient({ user });
    mock.method(pool, 'connect', async () => client);
    const res = makeResponse();
    await resendVerification({ validatedData: { email: 'rider@gmail.com' } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.message, 'Verification email request accepted.');
  }
});

const makeVerificationResponse = () => ({
  ...makeResponse(),
  headersSent: false,
  writableEnded: false,
  setTimeout() {},
});

test('expired verification tokens are rejected and cleared', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text.trim()) || text.startsWith('SET LOCAL')) return { rows: [] };
      if (text.includes('WHERE email_verification_token')) {
        return { rows: [{ id: 31, email: 'expired@gmail.com', is_active: true, email_verified: false, email_verification_expires: new Date(Date.now() - 1000) }] };
      }
      if (text.includes('SET email_verification_token = NULL')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected expired-token query: ${text}`);
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  const res = makeVerificationResponse();

  await verifyEmailToken({ validatedData: { token: 'a'.repeat(64) } }, res);

  assert.equal(res.statusCode, 410);
  assert.equal(res.body.code, 'VERIFICATION_TOKEN_EXPIRED');
  assert.ok(calls.some((call) => call.sql.includes('SET email_verification_token = NULL')));
});

test('valid verification activates the matching account and records one-time token use', async () => {
  const calls = [];
  const currentUser = {
    id: 32, name: 'Valid Rider', email: 'valid@gmail.com', role: 'customer', phone: null,
    avatar: null, store_credit: 0, is_active: true, two_factor_enabled: false,
    oauth_provider: null, last_login: null, email_verified: false,
    email_verification_expires: new Date(Date.now() + 60_000),
  };
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text.trim()) || text.startsWith('SET LOCAL')) return { rows: [] };
      if (text.includes('WHERE email_verification_token')) return { rows: [currentUser] };
      if (text.includes('SET email_verified = true')) return { rows: [{ ...currentUser, email_verified: true }] };
      if (text.includes('INSERT INTO sessions')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected valid-token query: ${text}`);
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));
  const session = {
    regenerate(callback) { callback(); },
    save(callback) { callback(); },
  };
  const res = makeVerificationResponse();

  await verifyEmailToken({
    validatedData: { token: 'b'.repeat(64) },
    session,
    clientIp: '127.0.0.1',
    clientUa: 'unit-test',
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Email verified successfully. Logging you in...');
  assert.equal(res.body.user.id, 32);
  assert.equal(res.body.user.email_verified, true);
  assert.ok(calls.some((call) => call.sql.includes('last_email_verification_token = $2')));
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO sessions')));
});

test('a previously consumed verification token cannot activate another account', async () => {
  const client = {
    async query(sql) {
      const text = String(sql);
      if (['BEGIN', 'ROLLBACK'].includes(text.trim()) || text.startsWith('SET LOCAL')) return { rows: [] };
      if (text.includes('WHERE email_verification_token')) return { rows: [] };
      if (text.includes('WHERE last_email_verification_token')) return { rows: [{ id: 32, email_verified: true }] };
      throw new Error(`Unexpected used-token query: ${text}`);
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  const res = makeVerificationResponse();

  await verifyEmailToken({ validatedData: { token: 'c'.repeat(64) } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.code, 'VERIFICATION_TOKEN_USED');
  assert.equal(res.body.alreadyVerified, true);
});

test('verification lifecycle migration supplies callback and cooldown columns', async () => {
  const migration = await readFile(
    path.join(repoRoot, 'backend', 'migrations', '202609230001_email_verification_delivery_lifecycle.cjs'),
    'utf8'
  );
  assert.match(migration, /last_email_verification_token/);
  assert.match(migration, /last_email_verification_at/);
  assert.match(migration, /email_verification_sent_at/);
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
