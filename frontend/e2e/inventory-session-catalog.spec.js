import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// All API requests are intercepted. No shared database or provider is used.
async function sessionFixture(page, remaining = 65000) {
  const base = Date.now() + 1000;
  await page.clock.install({ time: new Date(base - 1000) });
  await page.clock.pauseAt(new Date(base));
  const fixture = await staffFixture(page, { user: { role: 'customer' } });
  const state = { now: base, deadline: base + remaining, refreshes: 0, activities: 0, reads: 0 };
  await page.route('**/api/auth/session**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/refresh')) { state.refreshes++; state.deadline = state.now + 1800000; }
    if (path.endsWith('/activity')) state.activities++;
    if (path === '/api/auth/session') state.reads++;
    return route.fulfill({ json: { expires_at: new Date(state.deadline).toISOString(), server_now: new Date(state.now).toISOString(), warning_seconds: 60 } });
  });
  return { state, fixture };
}

test('inventory cost follows store price and cannot be edited independently', async ({ page }) => {
  await staffFixture(page, { user: { role: 'owner' } });
  await page.goto('/#/admin/inventory');
  await page.getByRole('button', { name: 'Add Inventory Item', exact: true }).click();
  const store = page.getByLabel('Store Selling Price', { exact: true });
  const cost = page.getByLabel('Cost Price', { exact: false });
  await store.fill('150');
  await expect(cost).toHaveValue('120.00');
  await expect(cost).toHaveAttribute('readonly', '');
  await store.fill('199.99');
  await expect(cost).toHaveValue('159.99');
});

for (const width of [390,768,1440]) {
  test(`session warning uses server expiry and renews only on request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state } = await sessionFixture(page);
    await page.goto('/#/');
    await expect.poll(() => state.reads).toBeGreaterThan(0);
    await expect(page.getByRole('dialog', { name: 'Are you still there?' })).toHaveCount(0);
    state.now += 6000;
    await page.clock.fastForward(6000);
    const dialog = page.getByRole('dialog', { name: 'Are you still there?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Your session will expire in 00:5[89]/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect.poll(() => state.refreshes).toBe(1);
    await expect(dialog).toHaveCount(0);
    state.now += 90000;
    await page.clock.fastForward(90000);
    await expect(dialog).toHaveCount(0);
    expect(state.refreshes).toBe(1);
    expect(state.activities).toBe(0);
  });
}

test('sleeping past the actual expiry signs out immediately', async ({ page }) => {
  const { state, fixture } = await sessionFixture(page);
  await page.goto('/#/');
  await expect.poll(() => state.reads).toBeGreaterThan(0);
  state.now += 90000;
  await page.clock.fastForward(90000);
  await expect(page).toHaveURL(/#\/login/);
  await expect.poll(() => fixture.calls.filter(call => call.path === '/auth/logout').length).toBe(1);
});

test('a new MFA policy challenge is preserved rather than treated as session expiry', async ({ page }) => {
  const fixture = await staffFixture(page, { user: { role: 'owner' } });
  await page.route('**/api/auth/session', route => {
    fixture.user.requires_2fa_enrollment = true;
    return route.fulfill({ status: 403, json: { code: 'TWO_FACTOR_ENROLLMENT_REQUIRED', message: 'Complete two-factor authentication to continue.' } });
  });
  await page.goto('/#/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Set up two-factor authentication', exact: true })).toBeVisible();
  expect(fixture.calls.some(call => call.path === '/auth/logout')).toBe(false);
});

test('signing out from the warning clears another open tab', async ({ page, context }) => {
  const first = await sessionFixture(page);
  const second = await context.newPage();
  const other = await sessionFixture(second);
  await page.goto('/#/');
  await second.goto('/#/');
  await expect.poll(() => other.state.reads).toBeGreaterThan(0);
  await expect.poll(() => first.state.reads).toBeGreaterThan(0);
  first.state.now += 6000;
  await page.clock.fastForward(6000);
  await page.getByRole('dialog', { name: 'Are you still there?' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(second).toHaveURL(/#\/login/);
});

test('listing removal invalidates public detail and recent history without duplicate view analytics', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  const part = { id: 98001, name: 'Battery Cover', price: 173, stock_quantity: 1, available_stock: 1, inventory_status: 'active', visibility_status: 'active', image: '/images/product-fallback.svg', variants: [] };
  const state = { listed: false, views: 0 };
  await page.addInitScript(() => localStorage.setItem('recentlyViewed', JSON.stringify([{ id: 98001, name: 'Stale battery', stock_quantity: 2 }])));
  await page.route(/\/api\/products(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: state.listed ? [part] : [] });
    if (/\/views?$/.test(path)) { state.views++; return route.fulfill({ json: { success: true } }); }
    if (/\/variants$/.test(path)) return route.fulfill({ json: { options: [], variants: [] } });
    if (path === '/api/products/98001') return route.fulfill({ status: state.listed ? 200 : 404, json: state.listed ? part : { message: 'Product not found' } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/#/');
  await expect(page.getByText('No products are available yet', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recentlyViewed'))).toBeNull();
  await page.evaluate(() => { location.hash = '/products/98001'; });
  await expect(page.getByText('Product not found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  state.listed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('catalog:updated')));
  await expect(page.getByRole('heading', { name: 'Battery Cover', exact: true })).toBeVisible();
  await expect.poll(() => state.views).toBe(1);
  await expect(page.getByText(/173/).first()).toBeVisible();
  state.listed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('catalog:updated')));
  await expect(page.getByText('Product not found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('recentlyViewed'))).toBeNull();
  expect(state.views).toBe(1);
});
