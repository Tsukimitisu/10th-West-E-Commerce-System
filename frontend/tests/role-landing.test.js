import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { roleLandingPath } from '../utils/roleLanding.js';

test('restored operations roles land in their workspace while customers retain Home', () => {
  assert.equal(roleLandingPath('owner'), '/admin/dashboard');
  assert.equal(roleLandingPath('admin'), '/admin/dashboard');
  assert.equal(roleLandingPath('super_admin'), '/superadmin/dashboard');
  assert.equal(roleLandingPath('store_staff'), '/staff/dashboard');
  assert.equal(roleLandingPath('cashier'), '/pos');
  assert.equal(roleLandingPath('customer'), null);
  assert.equal(roleLandingPath(undefined), null);
});

test('the root route redirects only after session profile restoration', async () => {
  const app = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /await syncUserWithProfileRefresh\(\)/);
  assert.match(app, /if \(loading\)/);
  assert.match(app, /path="\/" element=\{roleLandingPath\(user\?\.role\)/);
  assert.match(app, /<Navigate to=\{roleLandingPath\(user\.role\)\} replace \/>/);
});
