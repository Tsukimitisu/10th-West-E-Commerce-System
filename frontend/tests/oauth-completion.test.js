import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { refreshOAuthProfile, oauthDestination, clearOAuthErrors, SESSION_REFRESH_MESSAGE } from '../utils/oauthCompletion.js';

test('OAuth refresh returns profile and retries one transient unauthenticated response', async () => {
  let calls = 0;
  const events = [];
  const user = { id: 42, role: 'customer' };
  const result = await refreshOAuthProfile({
    getProfile: async () => { if (++calls === 1) throw { status: 401 }; return user; },
    delay: async ms => assert.equal(ms, 500), log: event => events.push(event),
  });
  assert.equal(result, user);
  assert.equal(calls, 2);
  assert.ok(events.includes('OAUTH_PROFILE_REFRESH_RETRY'));
  assert.equal(events.at(-1), 'OAUTH_PROFILE_REFRESH_SUCCESS');
});

test('OAuth refresh never authenticates an empty profile or loops on failure', async () => {
  let calls = 0;
  await assert.rejects(refreshOAuthProfile({ getProfile: async () => { calls++; return null; }, delay: async () => {} }),
    { code: 'oauth_session_failed', message: SESSION_REFRESH_MESSAGE });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(refreshOAuthProfile({ getProfile: async () => { calls++; throw { status: 403 }; } }),
    { code: 'oauth_session_failed' });
  assert.equal(calls, 1);
});

test('OAuth success uses role dashboards and rejects stale or external return paths', () => {
  for (const [role, path] of Object.entries({ customer: '/', owner: '/admin/dashboard', admin: '/admin/dashboard',
    store_staff: '/staff/dashboard', super_admin: '/superadmin/dashboard', cashier: '/pos' })) {
    assert.equal(oauthDestination({ role }), path);
  }
  assert.equal(oauthDestination({ role: 'customer' }, '/checkout'), '/checkout');
  for (const path of ['//evil.test', '/\\evil.test', '/login?google=failed', '/oauth-callback?status=success']) {
    assert.equal(oauthDestination({ role: 'customer' }, path), '/');
  }
});

test('OAuth clears only stale auth errors without deleting cart or unrelated storage', () => {
  const keys = new Map([['oauth_error', 'failed'], ['facebook_failed', 'true'], ['cart', 'keep']]);
  clearOAuthErrors([{ removeItem: key => keys.delete(key) }, { removeItem() { throw Error('blocked'); } }]);
  assert.deepEqual([...keys], [['cart', 'keep']]);
});

test('callback verifies success and missing status, uses bounded shared operation and no logout', async () => {
  const source = await readFile(new URL('../pages/OAuthCallback.jsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  assert.match(source, /if \(error \|\| status === 'failed'\)/);
  assert.match(source, /completionRef.current = withTimeout/);
  assert.doesNotMatch(source, /handledRef|logout/);
  assert.match(source, /getProfile\(\{ oauthRefresh: true \}\)/);
  assert.match(source, /onLoginRef.current\(user\)/);
  assert.match(api, /credentials: 'include'/);
  assert.match(api, /preserveSessionOnFailure: oauthRefresh/);
  assert.match(api, /!preserveSessionOnFailure && isSessionAuthFailure/);
});
