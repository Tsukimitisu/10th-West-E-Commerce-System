import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reconcileCheckoutSelection } from '../utils/checkoutSelection.js';

test('checkout keeps a selected server cart item after a tab reload', () => {
  assert.deepEqual(reconcileCheckoutSelection([42], [], [42]), [42]);
  assert.deepEqual(reconcileCheckoutSelection([42], [], []), []);
  assert.deepEqual(reconcileCheckoutSelection([42], [51], [42, 51]), [51]);
});

test('authenticated cart failures do not display cached items as a live badge', async () => {
  const context = await readFile(new URL('../context/CartContext.jsx', import.meta.url), 'utf8');
  const serverCartBranch = context.split('const response = await fetch(`${API_URL}/cart`')[1].split('// Initialize cart on mount')[0];
  assert.match(serverCartBranch, /setItems\(\[\]\);\s*setCartSyncError/);
  assert.doesNotMatch(serverCartBranch, /setItems\(savedCart/);
  assert.match(context, /window\.addEventListener\('online', refresh\)/);
  assert.match(context, /document\.addEventListener\('visibilitychange', refreshVisible\)/);
  assert.match(context, /hasLoadedSelection && !cartSyncError/);
  assert.match(context, /return Array\.from\(new Set\(JSON\.parse\(raw\)\)\)/);
});

test('checkout refreshes the server cart and shows a retry state on failure', async () => {
  const checkout = await readFile(new URL('../pages/customer/Checkout.jsx', import.meta.url), 'utf8');
  assert.match(checkout, /const current = await syncCart\(\)/);
  assert.match(checkout, /if \(isBuyNow \|\| !cartInitialized \|\| checkingCart \|\| cartLoadError\) return/);
  assert.match(checkout, /onClick=\{refreshCheckoutCart\}/);
});
