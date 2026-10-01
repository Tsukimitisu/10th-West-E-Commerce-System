import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { resolveSessionTransport, describeSessionTransport } from './sessionTransport.js';
import { resolveAllowedFrontendOrigins } from './frontend.js';
import { generateCsrfToken, validateCsrf } from '../middleware/csrf.js';
import { getGoogleOAuthConfigurationStatus, getFacebookOAuthConfigurationStatus } from './passport.js';

const frontend = 'https://10th-west-e-commerce-system.vercel.app';
const backend = 'https://one0th-west-e-commerce-system.onrender.com';

test('production and Render preview share proxy trust, secure host-only cookies and exact origin', () => {
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'development', RENDER: 'true' }]) {
    const transport = resolveSessionTransport(env);
    assert.equal(transport.trustProxy, 1);
    assert.deepEqual(transport.cookie, { secure: true, httpOnly: true, sameSite: 'none', path: '/' });
    const allowedOrigins = resolveAllowedFrontendOrigins({ FRONTEND_ORIGIN: frontend });
    assert.deepEqual(allowedOrigins, [frontend]);
    const diagnostics = describeSessionTransport({ transport, req: { headers: { origin: frontend }, secure: true }, allowedOrigins, postgres: true });
    assert.equal(diagnostics.origin_allowed, true);
    assert.equal(diagnostics.session_store, 'postgres');
    assert.equal(diagnostics.session_cookie_present, false);
    assert.equal(describeSessionTransport({ transport, req: { headers: { origin: 'https://untrusted.example' } }, allowedOrigins, postgres: true }).origin_allowed, false);
  }
  assert.deepEqual(resolveSessionTransport({ NODE_ENV: 'development' }).cookie,
    { secure: false, httpOnly: true, sameSite: 'lax', path: '/' });
  assert.equal(resolveSessionTransport({ NODE_ENV: 'development' }).trustProxy, 0);
});

test('Render HTTPS proxy persists session cookie and accepts only its matching CSRF token', async () => {
  const transport = resolveSessionTransport({ RENDER: 'true', NODE_ENV: 'development' });
  const app = express();
  app.set('trust proxy', transport.trustProxy);
  app.use(cors({ origin: frontend, credentials: true }));
  app.use(express.json());
  app.use(session({ name: 'twm.sid', secret: 'isolated-session-transport-test-secret', resave: false, saveUninitialized: false, cookie: transport.cookie }));
  app.use('/api', validateCsrf);
  app.get('/api/csrf-token', generateCsrfToken, (req, res) => res.json({ csrfToken: req.csrfToken }));
  app.post('/api/auth/login', (_req, res) => res.json({ csrfAccepted: true }));
  for (const provider of ['google', 'facebook']) app.get(`/api/auth/${provider}`, (_req, res) => res.sendStatus(204));
  // Signature verification remains the payment controller's responsibility.
  app.post('/api/payments/paymongo/webhook', (_req, res) => res.json({ reachedWebhook: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: frontend, 'X-Forwarded-Proto': 'https' };
  try {
    const issuance = await fetch(`${base}/api/csrf-token`, { headers });
    assert.equal(issuance.headers.get('access-control-allow-origin'), frontend);
    assert.equal(issuance.headers.get('access-control-allow-credentials'), 'true');
    assert.match(issuance.headers.get('cache-control'), /no-store/);
    const cookie = issuance.headers.getSetCookie().find(value => value.startsWith('twm.sid='));
    assert.ok(cookie, 'secure session cookie must be emitted behind the HTTPS proxy');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=None/);
    assert.doesNotMatch(cookie, /Domain=/);
    const { csrfToken } = await issuance.json();
    const accepted = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...headers, Cookie: cookie.split(';')[0], 'x-csrf-token': csrfToken } });
    assert.equal(accepted.status, 200);
    for (const invalidHeaders of [{ Cookie: cookie.split(';')[0] }, { 'x-csrf-token': csrfToken }]) {
      const rejected = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...headers, ...invalidHeaders } });
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).code, 'CSRF_INVALID_TOKEN');
    }
    for (const provider of ['google', 'facebook']) {
      assert.equal((await fetch(`${base}/api/auth/${provider}`, { headers })).status, 204);
    }
    assert.equal((await fetch(`${base}/api/payments/paymongo/webhook`, { method: 'POST', headers })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('OAuth production callback validation keeps both providers on the exact Render origin', () => {
  const env = { NODE_ENV: 'production', BACKEND_URL: backend, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-google-secret', FACEBOOK_APP_ID: 'test-app', FACEBOOK_APP_SECRET: 'test-facebook-secret' };
  for (const [provider, getStatus] of [['google', getGoogleOAuthConfigurationStatus], ['facebook', getFacebookOAuthConfigurationStatus]]) {
    const key = `${provider.toUpperCase()}_CALLBACK_URL`;
    assert.equal(getStatus(env).callbackUrl, `${backend}/api/auth/${provider}/callback`);
    assert.equal(getStatus(env).configured, true);
    for (const wrongOrigin of [frontend, 'https://localhost']) {
      assert.equal(getStatus({ ...env, [key]: `${wrongOrigin}/api/auth/${provider}/callback` }).configured, false);
    }
  }
});
