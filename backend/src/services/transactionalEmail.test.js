import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import {
  sendPasswordResetEmail,
  sendTransactionalEmail,
  sendVerificationEmail,
} from './transactionalEmail.js';

const EMAIL_ENV_NAMES = [
  'EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_FROM', 'EMAIL_FROM',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD',
];

const originalEnvironment = Object.fromEntries(
  EMAIL_ENV_NAMES.map((name) => [name, process.env[name]])
);

afterEach(() => {
  mock.restoreAll();
  for (const name of EMAIL_ENV_NAMES) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const clearEmailEnvironment = () => {
  for (const name of EMAIL_ENV_NAMES) delete process.env[name];
};

const message = {
  to: 'rider@example.test',
  subject: 'Unit email',
  html: '<p>Unit email</p>',
  text: 'Unit email',
  requestId: 'request-unit-1',
  userId: 41,
};

test('EMAIL_PROVIDER=resend selects Resend and never calls SMTP', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_unit_secret',
    RESEND_FROM: '10th West Moto <onboarding@resend.dev>',
  });
  const resendSend = mock.fn(async () => ({ data: { id: 'resend-message-id' }, error: null }));
  const smtpSend = mock.fn(async () => ({ messageId: 'smtp-message-id' }));

  const result = await sendTransactionalEmail({
    ...message,
    dependencies: {
      resendClient: { emails: { send: resendSend } },
      smtpTransport: { sendMail: smtpSend },
    },
  });

  assert.deepEqual(result, {
    provider: 'resend',
    accepted: true,
    messageId: 'resend-message-id',
  });
  assert.equal(resendSend.mock.callCount(), 1);
  assert.equal(smtpSend.mock.callCount(), 0);
});

test('EMAIL_PROVIDER=smtp selects SMTP and never calls Resend', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.unit.test',
    SMTP_PORT: '587',
    SMTP_USER: 'unit-user',
    SMTP_PASS: 'unit-password',
    EMAIL_FROM: '10th West Moto <noreply@unit.test>',
  });
  const resendSend = mock.fn(async () => ({ data: { id: 'resend-message-id' }, error: null }));
  const smtpSend = mock.fn(async () => ({ messageId: 'smtp-message-id' }));

  const result = await sendTransactionalEmail({
    ...message,
    dependencies: {
      resendClient: { emails: { send: resendSend } },
      smtpTransport: { sendMail: smtpSend },
    },
  });

  assert.equal(result.provider, 'smtp');
  assert.equal(result.accepted, true);
  assert.equal(resendSend.mock.callCount(), 0);
  assert.equal(smtpSend.mock.callCount(), 1);
});

test('Resend configuration failures are safe and do not call a provider', async () => {
  for (const missingName of ['RESEND_API_KEY', 'RESEND_FROM']) {
    clearEmailEnvironment();
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_unit_secret',
      RESEND_FROM: '10th West Moto <onboarding@resend.dev>',
    });
    delete process.env[missingName];
    const resendSend = mock.fn(async () => ({ data: { id: 'unexpected' }, error: null }));

    const result = await sendTransactionalEmail({
      ...message,
      dependencies: { resendClient: { emails: { send: resendSend } } },
    });

    assert.deepEqual(result, {
      provider: 'resend',
      accepted: false,
      code: 'EMAIL_CONFIG_MISSING',
      retryable: false,
    });
    assert.equal(resendSend.mock.callCount(), 0);
    mock.restoreAll();
  }
});

test('Resend provider rejection returns a normalized safe failure', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_unit_secret',
    RESEND_FROM: '10th West Moto <onboarding@resend.dev>',
  });

  const result = await sendTransactionalEmail({
    ...message,
    dependencies: {
      resendClient: {
        emails: {
          send: async () => ({ data: null, error: { name: 'rate_limit_exceeded', statusCode: 429 } }),
        },
      },
    },
  });

  assert.equal(result.provider, 'resend');
  assert.equal(result.accepted, false);
  assert.equal(result.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(result.retryable, true);
  assert.doesNotMatch(JSON.stringify(result), /re_unit_secret/);
});

test('verification logs omit API keys, recipients, and verification tokens', async () => {
  clearEmailEnvironment();
  const apiKey = 're_never_log_this_value';
  const token = 'a'.repeat(64);
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: apiKey,
    RESEND_FROM: '10th West Moto <onboarding@resend.dev>',
  });
  const logEntries = [];
  mock.method(console, 'info', (...args) => logEntries.push(args));
  mock.method(console, 'warn', (...args) => logEntries.push(args));
  let payload;

  const result = await sendVerificationEmail({
    email: 'private-rider@example.test',
    name: 'Private Rider',
    verificationUrl: `https://store.example.test/#/verify-email?token=${token}`,
    expiresInMinutes: 3,
    requestId: 'request-unit-2',
    userId: 42,
    dependencies: {
      resendClient: {
        emails: {
          send: async (nextPayload) => {
            payload = nextPayload;
            return { data: { id: 'message-id' }, error: null };
          },
        },
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(payload.subject, 'Verify your 10th West Moto account');
  assert.match(payload.html, /If you did not create this account, you may ignore this email\./);
  assert.match(payload.text, /verify-email\?token=/);
  const serializedLogs = JSON.stringify(logEntries);
  assert.doesNotMatch(serializedLogs, new RegExp(apiKey));
  assert.doesNotMatch(serializedLogs, new RegExp(token));
  assert.doesNotMatch(serializedLogs, /private-rider@example\.test/);
});

test('password reset remains compatible with the Resend provider abstraction', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_unit_secret',
    RESEND_FROM: '10th West Moto <onboarding@resend.dev>',
  });
  let payload;
  const result = await sendPasswordResetEmail({
    email: 'rider@example.test',
    name: 'Rider',
    resetUrl: 'https://store.example.test/#/reset-password?token=unit-token',
    requestId: 'request-unit-3',
    userId: 43,
    dependencies: {
      resendClient: {
        emails: {
          send: async (nextPayload) => {
            payload = nextPayload;
            return { data: { id: 'reset-message-id' }, error: null };
          },
        },
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(payload.subject, 'Password Reset - 10th West Moto');
  assert.match(payload.text, /reset-password\?token=unit-token/);
});
