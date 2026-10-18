import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import {
  emailBrandHeader,
  sendPasswordResetEmail,
  sendTransactionalEmail,
  sendVerificationEmail,
} from './transactionalEmail.js';

test('email branding uses the official asset without leaking action tokens or URL credentials', () => {
  const html = emailBrandHeader('https://user:secret@shop.example.test/?token=private#/verify-email');
  assert.match(html, /src="https:\/\/shop\.example\.test\/brand\/10th-west-logo\.png"/);
  assert.match(html, /Motorcycle Parts &amp; Accessories/);
  assert.doesNotMatch(html, /private|secret|user:|token=/);
  assert.doesNotMatch(emailBrandHeader('javascript:alert(1)'), /<img/);
  assert.doesNotMatch(emailBrandHeader('invalid URL'), /<img/);
});

const EMAIL_ENV_NAMES = [
  'EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_FROM', 'EMAIL_FROM',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD',
  'EMAIL_PROVIDER_TIMEOUT_MS', 'NODE_ENV',
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

const deliveryCases = [
  { name: 'success', response: { data: { id: 'provider-send-id' }, error: null }, accepted: true },
  { name: 'invalid key', status: 401, reason: 'invalid_api_key', error: { name: 'validation_error', statusCode: 401, message: 'API key is invalid' } },
  { name: 'unverified domain', status: 403, reason: 'domain_not_verified', error: { name: 'validation_error', statusCode: 403, message: 'The sender domain is not verified.' } },
  { name: 'test sender restriction', status: 403, reason: 'test_sender_restricted', error: { name: 'validation_error', statusCode: 403, message: 'You can only send testing emails to your own email address.' } },
  { name: 'rate limit', status: 429, reason: 'rate_limited', error: { name: 'rate_limit_exceeded', statusCode: 429 }, retryable: true },
  { name: 'suppressed recipient', status: 400, reason: 'suppressed_or_bounced', error: { name: 'validation_error', statusCode: 400, message: 'Recipient is suppressed due to a previous bounce.' } },
  { name: 'timeout', timeout: true, reason: 'timeout', retryable: true },
  { name: 'network failure', network: true, reason: 'network', retryable: true },
  ...[undefined, {}, { data: {} }, { data: { id: '' } }, { data: { id: '  ' } }, { data: { id: 123 } }]
    .map((response, index) => ({ name: `malformed response ${index}`, response, reason: 'invalid_response' })),
  { name: 'ID accompanied by error', response: { data: { id: 'not-success' }, error: { name: 'validation_error', statusCode: 403, message: 'Domain not verified' } }, reason: 'domain_not_verified', status: 403 },
];

for (const kind of ['verification', 'password_reset']) {
  for (const scenario of deliveryCases) {
    test(`${kind}: ${scenario.name} is classified without logging secrets`, async () => {
      clearEmailEnvironment();
      Object.assign(process.env, { NODE_ENV: 'test', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_private_api_key', RESEND_FROM: '10th West <mail@verified.example.test>', EMAIL_PROVIDER_TIMEOUT_MS: '1000' });
      const logs = [];
      for (const method of ['info', 'warn', 'error']) mock.method(console, method, (...args) => logs.push(args));
      const send = mock.fn(async () => {
        if (scenario.timeout) return new Promise(() => {});
        if (scenario.network) throw Object.assign(new Error('private-rider@example.test private-token re_private_api_key'), { code: 'ECONNRESET' });
        return scenario.error ? { data: null, error: { ...scenario.error, message: `${scenario.error.message || ''} private-rider@example.test private-token re_private_api_key` } } : scenario.response;
      });
      const args = { email: 'private-rider@example.test', name: 'Rider', requestId: 'safe-request-id', userId: 7,
        verificationUrl: 'https://shop.example.test/#/verify-email?token=private-token', expiresInMinutes: 3,
        resetUrl: 'https://shop.example.test/#/reset-password?token=private-token', dependencies: { resendClient: { emails: { send } } } };
      const result = await (kind === 'verification' ? sendVerificationEmail(args) : sendPasswordResetEmail(args));
      assert.equal(result.accepted, Boolean(scenario.accepted));
      assert.equal(send.mock.callCount(), 1);
      const entry = logs.find(([event]) => event === (scenario.accepted ? 'EMAIL_SEND_SUCCESS' : 'EMAIL_SEND_FAILED'))?.[1];
      assert.equal(entry.event_type, kind);
      assert.equal(entry.request_id, 'safe-request-id');
      assert.equal(entry.provider, 'resend');
      if (scenario.reason) assert.equal(entry.reason, scenario.reason);
      if (scenario.status) assert.equal(entry.provider_status, scenario.status);
      if (scenario.retryable) assert.equal(result.retryable, true);
      assert.doesNotMatch(JSON.stringify(logs), /private-rider@example\.test|private-token|re_private_api_key/);
    });
  }
}

test('production refuses the Resend test sender before contacting the provider', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, { NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_private_production_key', RESEND_FROM: '10th West <onboarding@resend.dev>' });
  const logs = [];
  for (const method of ['info', 'warn']) mock.method(console, method, (...args) => logs.push(args));
  const send = mock.fn(async () => ({ data: { id: 'must-not-send' }, error: null }));
  const result = await sendPasswordResetEmail({ email: message.to, resetUrl: 'https://shop.example.test/#/reset-password?token=private-token', dependencies: { resendClient: { emails: { send } } } });
  assert.equal(result.accepted, false);
  assert.equal(result.code, 'RESEND_TEST_SENDER');
  assert.equal(send.mock.callCount(), 0);
  assert.doesNotMatch(JSON.stringify(logs), /private-token|re_private_production_key|rider@example.test/);
});

test('actual Resend SDK errors cannot print raw provider fields, even outside production', async () => {
  clearEmailEnvironment();
  Object.assign(process.env, { NODE_ENV: 'development', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_private_sdk_key', RESEND_FROM: '10th West <noreply@verified.example.test>' });
  const logs = [];
  for (const method of ['info', 'warn', 'error']) mock.method(console, method, (...args) => logs.push(args));
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    name: 're_private_sdk_key', statusCode: 403, message: 'Domain not verified private-token private-rider@example.test',
  }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
  const result = await sendPasswordResetEmail({ email: 'private-rider@example.test', resetUrl: 'https://shop.example.test/#/reset-password?token=private-token' });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.accepted, false);
  assert.equal(result.code, 'EMAIL_DELIVERY_FAILED');
  assert.doesNotMatch(JSON.stringify(logs), /private-token|re_private_sdk_key|private-rider@example.test/);
  assert.ok(logs.some(([event, details]) => event === 'EMAIL_SEND_FAILED' && details.reason === 'domain_not_verified'));
});
