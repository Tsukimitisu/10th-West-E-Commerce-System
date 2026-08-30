import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/google_oauth_test';
process.env.GOOGLE_CLIENT_ID = 'unit-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'unit-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';

const {
  default: passport,
  GOOGLE_OAUTH_SCOPES,
  getGoogleOAuthConfigurationStatus,
  mapGoogleProfile,
} = await import('./passport.js');
const { default: pool } = await import('./database.js');
const { getAuthAvailability, getGoogleAuthAvailability } = await import('../routes/auth.js');

after(async () => {
  await pool.end().catch(() => {});
});

test('Google OAuth configuration uses the exact environment callback and public readiness exposes no secret', () => {
  const configuration = getGoogleOAuthConfigurationStatus();
  assert.equal(configuration.configured, true);
  assert.equal(configuration.callbackUrl, 'http://localhost:5000/api/auth/google/callback');
  assert.deepEqual(configuration.missing, []);

  const readiness = getAuthAvailability();
  assert.deepEqual(
    { available: readiness.google.available, reason: readiness.google.reason },
    { available: true, reason: null }
  );
  assert.equal(readiness.google.client_id_present, true);
  assert.equal(readiness.google.client_secret_present, true);
  assert.equal(readiness.google.callback_url_present, true);
  assert.equal(readiness.google.callback_url, process.env.GOOGLE_CALLBACK_URL);
  assert.doesNotMatch(JSON.stringify(readiness), /unit-google-client-secret|access_token|refresh_token/i);
});

test('Google configuration accepts the supported AUTH and OAUTH aliases', () => {
  const aliasStatus = getGoogleOAuthConfigurationStatus({
    GOOGLE_AUTH_CLIENT_ID: 'alias-client-id',
    GOOGLE_AUTH_CLIENT_SECRET: 'alias-client-secret',
    GOOGLE_AUTH_CALLBACK_URL: 'http://localhost:5000/api/auth/google/callback',
    NODE_ENV: 'test',
  });

  assert.equal(aliasStatus.configured, true);
  assert.equal(aliasStatus.clientIdPresent, true);
  assert.equal(aliasStatus.clientSecretPresent, true);
  assert.equal(aliasStatus.callbackUrlPresent, true);
  assert.equal(aliasStatus.clientIdSource, 'GOOGLE_AUTH_CLIENT_ID');
  assert.equal(aliasStatus.clientSecretSource, 'GOOGLE_AUTH_CLIENT_SECRET');
  assert.equal(aliasStatus.callbackUrlSource, 'GOOGLE_AUTH_CALLBACK_URL');
});

test('Google readiness fails closed with a clear reason when credentials are missing', () => {
  const missingStatus = getGoogleOAuthConfigurationStatus({ NODE_ENV: 'test' });
  assert.equal(missingStatus.configured, false);
  assert.deepEqual(missingStatus.missing, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  assert.equal(missingStatus.callbackUrl, 'http://localhost:5000/api/auth/google/callback');

  const readiness = getGoogleAuthAvailability({ configuration: missingStatus, strategyAvailable: false });
  assert.deepEqual(
    { available: readiness.available, reason: readiness.reason },
    { available: false, reason: 'missing_google_oauth_config' }
  );
  assert.equal(readiness.client_id_present, false);
  assert.equal(readiness.client_secret_present, false);
  assert.equal(readiness.callback_url_present, true);
  assert.doesNotMatch(JSON.stringify(readiness), /alias-client-secret|access_token|refresh_token/i);
});

test('production Google callback configuration requires HTTPS', () => {
  const previousEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(getGoogleOAuthConfigurationStatus().configured, false);
    process.env.GOOGLE_CALLBACK_URL = 'https://api.example.test/api/auth/google/callback';
    assert.equal(getGoogleOAuthConfigurationStatus().configured, true);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';
  }
});

test('Google auth strategy starts authorization with minimal scopes and session-backed state', () => {
  const strategy = passport._strategy('google');
  assert.ok(strategy);
  assert.deepEqual([...strategy._scope], [...GOOGLE_OAUTH_SCOPES]);
  assert.equal(strategy._callbackURL, process.env.GOOGLE_CALLBACK_URL);
  assert.notEqual(strategy._stateStore?.constructor?.name, 'NullStore');

  const originalRedirect = strategy.redirect;
  const originalError = strategy.error;
  let redirectUrl = '';
  try {
    strategy.redirect = (url) => { redirectUrl = url; };
    strategy.error = (error) => { throw error; };
    strategy.authenticate({ query: {}, body: {}, session: {} }, { scope: GOOGLE_OAUTH_SCOPES });
  } finally {
    strategy.redirect = originalRedirect;
    strategy.error = originalError;
  }

  const authorizationUrl = new URL(redirectUrl);
  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), process.env.GOOGLE_CALLBACK_URL);
  assert.deepEqual(
    new Set(String(authorizationUrl.searchParams.get('scope') || '').split(' ')),
    new Set(GOOGLE_OAUTH_SCOPES)
  );
  assert.ok(authorizationUrl.searchParams.get('state'));
});

test('Google callback rejects invalid OAuth state before exchanging an authorization code', () => {
  const strategy = passport._strategy('google');
  const session = {};
  const originalRedirect = strategy.redirect;
  const originalError = strategy.error;
  const originalFail = strategy.fail;
  const originalTokenExchange = strategy._oauth2.getOAuthAccessToken;
  let authorizationUrl = '';
  let failure = null;
  let tokenExchangeCount = 0;

  try {
    strategy.redirect = (url) => { authorizationUrl = url; };
    strategy.error = (error) => { throw error; };
    strategy.authenticate({ query: {}, body: {}, session }, { scope: GOOGLE_OAUTH_SCOPES });
    const issuedState = new URL(authorizationUrl).searchParams.get('state');
    assert.ok(issuedState);

    strategy.fail = (info, status) => { failure = { info, status }; };
    strategy._oauth2.getOAuthAccessToken = () => { tokenExchangeCount += 1; };
    strategy.authenticate({
      query: { code: 'mock-authorization-code', state: `${issuedState}-invalid` },
      body: {},
      session,
    }, {});
  } finally {
    strategy.redirect = originalRedirect;
    strategy.error = originalError;
    strategy.fail = originalFail;
    strategy._oauth2.getOAuthAccessToken = originalTokenExchange;
  }

  assert.equal(failure?.status, 403);
  assert.match(String(failure?.info?.message || ''), /invalid authorization request state/i);
  assert.equal(tokenExchangeCount, 0);
});

test('verified Google profile mapping keeps identity fields but discards provider tokens', () => {
  const mapped = mapGoogleProfile({
    id: 'google-sub-456',
    displayName: 'Jane Rider',
    name: { givenName: 'Jane', familyName: 'Rider' },
    emails: [{ value: 'JANE.RIDER@GMAIL.COM', verified: true }],
    photos: [{ value: 'https://lh3.googleusercontent.com/jane' }],
    _json: { email_verified: true },
    accessToken: 'must-not-leak',
  });

  assert.deepEqual(mapped, {
    provider: 'google',
    providerUserId: 'google-sub-456',
    email: 'jane.rider@gmail.com',
    emailVerified: true,
    firstName: 'Jane',
    lastName: 'Rider',
    displayName: 'Jane Rider',
    profileImageUrl: 'https://lh3.googleusercontent.com/jane',
  });
  assert.equal('accessToken' in mapped, false);
});

test('Google routes use state-protected Passport flow and map cancellation safely', async () => {
  const source = await readFile(new URL('../routes/auth.js', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/google'/);
  assert.match(source, /scope: GOOGLE_OAUTH_SCOPES/);
  assert.match(source, /router\.get\('\/google\/callback'/);
  assert.match(source, /handleOAuthProviderResponseError\('google'\)/);
  assert.match(source, /providerError === 'access_denied'/);
  assert.match(source, /googleOAuthCallback/);
});
