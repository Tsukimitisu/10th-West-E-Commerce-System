import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { roleLandingPath, roleRouteRedirect } from '../utils/roleLanding.js';
import { oauthDestination } from '../utils/oauthCompletion.js';

test('restored operations roles land in their workspace while customers retain Home', () => {
  assert.equal(roleLandingPath('owner'), '/admin/dashboard');
  assert.equal(roleLandingPath('admin'), '/admin/dashboard');
  assert.equal(roleLandingPath('super_admin'), '/superadmin/dashboard');
  assert.equal(roleLandingPath('store_staff'), '/staff/dashboard');
  assert.equal(roleLandingPath('cashier'), '/pos');
  assert.equal(roleLandingPath('customer'), null);
  assert.equal(roleLandingPath(undefined), null);
});

test('every operations role is redirected before customer routes mount, regardless of entry method', () => {
  for (const role of ['owner', 'admin', 'super_admin', 'store_staff', 'cashier']) {
    for (const path of ['/', '/shop', '/products/12', '/cart', '/checkout', '/orders', '/orders/12', '/profile', '/messages', '/wishlist', '/my-returns', '/addresses', '/order-confirmation/12', '/payment/success', '/login', '/register']) {
      assert.equal(roleRouteRedirect(role, path), roleLandingPath(role), `${role}: ${path}`);
    }
    assert.equal(roleRouteRedirect(role, roleLandingPath(role)), null, 'home cannot loop');
    assert.equal(roleRouteRedirect(role, '/pos'), null);
    assert.equal(roleRouteRedirect(role, '/oauth-callback'), null, 'session completion must run');
    for (const returnTo of ['/profile', '/checkout', '//evil.test', '/%2f%2fevil.test', '/staff/../profile', '/login?returnTo=/cart']) {
      assert.equal(oauthDestination({ role }, returnTo), roleLandingPath(role));
    }
  }
  for (const path of ['/shop', '/checkout', '/profile', '/orders/12']) {
    assert.equal(roleRouteRedirect('customer', path), null);
    assert.equal(roleRouteRedirect(undefined, path), null);
  }
});

test('the root route redirects only after session profile restoration', async () => {
  const app = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /await syncUserWithProfileRefresh\(\)/);
  // Only the restricted cached POS can start before cloud profile restoration.
  assert.match(app, /if \(loading && !window\.location\.hash\.split\('\?'\)\[0\]\.match/);
  assert.match(app, /\^#\\\/pos/);
  assert.match(app, /path="\/" element=\{roleLandingPath\(user\?\.role\)/);
  assert.match(app, /<Navigate to=\{roleLandingPath\(user\.role\)\} replace \/>/);
});
