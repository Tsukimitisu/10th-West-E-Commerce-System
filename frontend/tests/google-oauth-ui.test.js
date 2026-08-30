import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFrontend = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const readProject = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('customer login and registration expose Google only when backend readiness enables it', async () => {
  const [login, register] = await Promise.all([
    readFrontend('pages/Login.jsx'),
    readFrontend('pages/Register.jsx'),
  ]);

  for (const source of [login, register]) {
    assert.match(source, /Continue with Google/);
    assert.match(source, /Google login is not configured yet\./);
    assert.match(source, /Google login status is unavailable\. Please start or restart the backend/);
    assert.match(source, /\/api\/auth\/providers/);
    assert.match(source, /disabled=\{loading \|\| oauthProviders\.loading \|\| !oauthProviders\.google\}/);
    assert.match(source, /oauthProviders\.error/);
    assert.match(source, /window\.location\.href = `\$\{API_ORIGIN\}\/api\/auth\/\$\{provider\}`/);
    assert.doesNotMatch(source, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
  }
});

test('OAuth callback consumes the existing cookie session without exposing Google credentials', async () => {
  const callback = await readFrontend('pages/OAuthCallback.jsx');

  assert.match(callback, /refreshCsrfAfterSessionRotation\(\)/);
  assert.match(callback, /getProfile\(\)/);
  assert.match(callback, /navigate\('\/'/);
  assert.match(callback, /oauth_invalid_state/);
  assert.match(callback, /oauth_unverified_email/);
  assert.doesNotMatch(callback, /access_token|refresh_token|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
});

test('Google backend environment placeholders and local callback are documented without ignoring the example', async () => {
  const [example, frontendExample, gitignore, viteConfig] = await Promise.all([
    readProject('backend/.env.example'),
    readFrontend('.env.example'),
    readProject('.gitignore'),
    readFrontend('vite.config.ts'),
  ]);

  assert.match(example, /^GOOGLE_CLIENT_ID=$/m);
  assert.match(example, /^GOOGLE_CLIENT_SECRET=$/m);
  assert.match(example, /^GOOGLE_CALLBACK_URL=http:\/\/localhost:5000\/api\/auth\/google\/callback$/m);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.local$/m);
  assert.match(gitignore, /^\.env\.\*\.local$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(viteConfig, /port:\s*5173/);
  assert.doesNotMatch(frontendExample, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
});
