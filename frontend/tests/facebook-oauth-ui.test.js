import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('login and registration enable Facebook from backend readiness and use a browser redirect', async () => {
  const [login, register] = await Promise.all([
    readFrontend('pages/Login.jsx'),
    readFrontend('pages/Register.jsx'),
  ]);

  for (const source of [login, register]) {
    assert.match(source, /Continue with Facebook/);
    assert.match(source, /Boolean\(providers\.facebook\?\.available\)/);
    assert.match(source, /disabled=\{loading \|\| oauthProviders\.loading \|\| !oauthProviders\.facebook\}/);
    assert.match(source, /window\.location\.href = `\$\{API_ORIGIN\}\/api\/auth\/\$\{provider\}`/);
    assert.doesNotMatch(source, /FACEBOOK_APP_SECRET|FACEBOOK_APP_ID/);
  }
});

test('login consumes Facebook failures once and clears stale provider query state', async () => {
  const login = await readFrontend('pages/Login.jsx');

  assert.match(login, /FACEBOOK_REASON_MESSAGES/);
  assert.match(login, /profile_missing_email: 'Facebook did not provide an email address/);
  assert.match(login, /state_mismatch: 'Facebook sign in expired/);
  assert.match(login, /session_save_failed: 'Facebook sign in completed but your session could not be saved/);
  assert.match(login, /nextParams\.delete\('facebook'\)/);
  assert.match(login, /cleanParams\.delete\('facebook'\)/);
});

test('OAuth callback supports Facebook while preserving the cookie-session refresh flow', async () => {
  const callback = await readFrontend('pages/OAuthCallback.jsx');

  assert.match(callback, /searchParams\.get\('provider'\) === 'facebook'/);
  assert.match(callback, /Completing secure \{searchParams\.get\('provider'\) === 'facebook'/);
  assert.match(callback, /refreshCsrfAfterSessionRotation\(\)/);
  assert.match(callback, /getProfile\(\)/);
  assert.match(callback, /onLoginRef\.current\(user\)/);
  assert.doesNotMatch(callback, /FACEBOOK_APP_SECRET|access_token|refresh_token/);
});
