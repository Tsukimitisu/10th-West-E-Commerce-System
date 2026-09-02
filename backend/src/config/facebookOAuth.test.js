import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/facebook_oauth_test';
process.env.FACEBOOK_APP_ID = 'unit-facebook-app-id';
process.env.FACEBOOK_APP_SECRET = 'unit-facebook-app-secret';
process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:5000/api/auth/facebook/callback';

const {
  default: passport,
  FACEBOOK_OAUTH_SCOPES,
  getFacebookOAuthConfigurationStatus,
  mapFacebookProfile,
} = await import('./passport.js');
const { default: pool } = await import('./database.js');
const { getAuthAvailability, getFacebookAuthAvailability } = await import('../routes/auth.js');

after(async () => pool.end().catch(() => {}));

test('Facebook configuration uses its exact callback and readiness exposes presence only', () => {
  const configuration = getFacebookOAuthConfigurationStatus();
  assert.equal(configuration.configured, true);
  assert.equal(configuration.callbackUrl, process.env.FACEBOOK_CALLBACK_URL);
  assert.deepEqual(configuration.missing, []);

  const readiness = getAuthAvailability().facebook;
  assert.deepEqual(
    { available: readiness.available, reason: readiness.reason },
    { available: true, reason: null }
  );
  assert.equal(readiness.app_id_present, true);
  assert.equal(readiness.app_secret_present, true);
  assert.equal(readiness.callback_url_present, true);
  assert.equal(readiness.callback_url, process.env.FACEBOOK_CALLBACK_URL);
  assert.doesNotMatch(JSON.stringify(readiness), /unit-facebook-app-secret|access_token/i);
});

test('Facebook readiness fails closed when credentials are missing', () => {
  const configuration = getFacebookOAuthConfigurationStatus({ NODE_ENV: 'test' });
  const readiness = getFacebookAuthAvailability({ configuration, strategyAvailable: false });

  assert.equal(configuration.configured, false);
  assert.deepEqual(configuration.missing, ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']);
  assert.deepEqual(
    { available: readiness.available, reason: readiness.reason },
    { available: false, reason: 'missing_facebook_oauth_config' }
  );
  assert.equal(readiness.app_secret_present, false);
});

test('Facebook strategy starts a state-protected browser authorization with email scope', () => {
  const strategy = passport._strategy('facebook');
  assert.ok(strategy);
  assert.equal(strategy._callbackURL, process.env.FACEBOOK_CALLBACK_URL);
  assert.equal(strategy._profileURL, 'https://graph.facebook.com/v22.0/me');
  assert.notEqual(strategy._stateStore?.constructor?.name, 'NullStore');

  const originalRedirect = strategy.redirect;
  const originalError = strategy.error;
  let redirectUrl = '';
  try {
    strategy.redirect = (url) => { redirectUrl = url; };
    strategy.error = (error) => { throw error; };
    strategy.authenticate({ query: {}, body: {}, session: {} }, { scope: FACEBOOK_OAUTH_SCOPES });
  } finally {
    strategy.redirect = originalRedirect;
    strategy.error = originalError;
  }

  const authorizationUrl = new URL(redirectUrl);
  assert.equal(authorizationUrl.hostname, 'www.facebook.com');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), process.env.FACEBOOK_CALLBACK_URL);
  assert.equal(authorizationUrl.searchParams.get('scope'), 'email');
  assert.ok(authorizationUrl.searchParams.get('state'));
});

test('Facebook callback rejects an invalid OAuth state before exchanging a code', () => {
  const strategy = passport._strategy('facebook');
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
    strategy.authenticate({ query: {}, body: {}, session }, { scope: FACEBOOK_OAUTH_SCOPES });
    const issuedState = new URL(authorizationUrl).searchParams.get('state');
    assert.ok(issuedState);

    strategy.fail = (info, status) => { failure = { info, status }; };
    strategy._oauth2.getOAuthAccessToken = () => { tokenExchangeCount += 1; };
    strategy.authenticate({
      query: { code: 'mock-facebook-code', state: `${issuedState}-invalid` },
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

test('Facebook profile mapping keeps only the provider identity and requires an email', () => {
  const mapped = mapFacebookProfile({
    id: 'facebook-user-123',
    displayName: 'Rider One',
    name: { givenName: 'Rider', familyName: 'One' },
    emails: [{ value: 'RIDER@EXAMPLE.COM' }],
    photos: [{ value: 'https://platform-lookaside.fbsbx.com/rider.jpg' }],
    accessToken: 'must-not-leak',
  });

  assert.deepEqual(mapped, {
    provider: 'facebook',
    providerUserId: 'facebook-user-123',
    email: 'rider@example.com',
    emailVerified: true,
    firstName: 'Rider',
    lastName: 'One',
    displayName: 'Rider One',
    profileImageUrl: 'https://platform-lookaside.fbsbx.com/rider.jpg',
  });
  assert.equal('accessToken' in mapped, false);
  assert.equal(mapFacebookProfile({ id: 'missing-email' }).emailVerified, false);
});

test('Facebook routes use the shared application session callback and provider errors are safe', async () => {
  const source = await readFile(new URL('../routes/auth.js', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/facebook'/);
  assert.match(source, /scope: FACEBOOK_OAUTH_SCOPES/);
  assert.match(source, /handleOAuthProviderResponseError\('facebook'\)/);
  assert.match(source, /facebookOAuthCallback/);
  assert.match(source, /router\.get\('\/me', authenticateToken, getProfile\)/);
  assert.doesNotMatch(source, /FACEBOOK_APP_SECRET\s*[:=]/);
});
