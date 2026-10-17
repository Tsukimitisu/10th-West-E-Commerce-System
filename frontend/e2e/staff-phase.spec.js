import { test, expect } from '@playwright/test';
import { staffFixture, staffPermissions } from './staffPhaseFixture.js';

test('Staff deep link survives staggered session restoration', async ({ page }) => {
  await staffFixture(page, { profileDelays: [1, 1200] });
  await page.goto('/#/staff/account');
  await expect(page.getByRole('heading', { name: 'Staff account & security' })).toBeVisible();
  await expect(page).toHaveURL(/#\/staff\/account/);
});

test('a delayed Staff account save cannot restore a signed-out session', async ({ page }) => {
  const state = await staffFixture(page);
  let releaseSave;
  let sawSave;
  const saveStarted = new Promise(resolve => { sawSave = resolve; });
  const saved = { ...state.user, name: 'Delayed Counter' };
  await page.route('**/api/users/profile', async route => {
    sawSave();
    await new Promise(resolve => { releaseSave = resolve; });
    await route.fulfill({ json: { user: saved, message: 'Profile updated' } });
  });
  await page.goto('/#/staff/dashboard');
  await page.getByLabel('Open profile menu').click();
  await page.getByRole('link', { name: 'Account & security' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Delayed Counter');
  await page.getByRole('button', { name: 'Save account', exact: true }).click();
  await saveStarted;
  await page.getByLabel('Open profile menu').click();
  await page.locator('.ops-user-popover').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/login/);
  const response = page.waitForResponse('**/api/users/profile');
  releaseSave();
  await response;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(async () => (await import('/services/authSession.js')).getCurrentAuthUser())).toBeNull();
  await expect(page).toHaveURL(/#\/login/);
});

test('Staff login, permitted routes, inventory filters and scan stay available', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill('staff@example.test');
  await page.getByPlaceholder('Enter your password').fill('FixtureOnly!23');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/#\/staff\/dashboard/);
  await expect(page.getByRole('heading', { name: /Today's work/ })).toBeVisible();
  const mobile = page.viewportSize().width < 1024;
  if (mobile) await page.getByLabel('Open navigation', { exact: true }).click();
  const nav = mobile ? page.getByRole('dialog', { name: 'Workspace navigation' }) : page.locator('.ops-desktop-sidebar');
  await expect(nav.getByRole('button', { name: /Point of sale/i })).toHaveCount(0);
  for (const name of ['Reports', 'Banners', 'Promotions', 'Customers', 'Staff']) await expect(nav.getByRole('button', { name, exact: true })).toHaveCount(0);
  if (mobile) await nav.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/#/staff/inventory');
  const search = page.getByRole('searchbox');
  await search.fill('BRK-H125-042');
  await expect(page.locator('main').getByText('Front Brake Pad Set', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('4T Engine Oil · 1 L', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await search.fill('');
  await page.getByLabel('Filter inventory by stock').selectOption('danger');
  await expect(page.locator('main').getByText('Drive Belt', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel('Filter inventory by stock').selectOption('all');
  await page.getByRole('button', { name: 'Barcode Scan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scan with Camera', exact: true })).toBeVisible();
});

test('Staff without POS permission is denied on the direct URL', async ({ page }) => {
  await staffFixture(page);
  await page.goto('/#/pos');
  await expect(page.getByRole('heading', { name: 'POS access is not enabled' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to dashboard' }).click();
  await expect(page).toHaveURL(/#\/staff\/dashboard/);
});

test('authorized Cashier POS remains available without a sale', async ({ page }) => {
  const state = await staffFixture(page, { user: { role: 'cashier' }, permissions: ['pos.access'] });
  await page.goto('/#/pos');
  await expect(page.getByText('Point of Sale', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(/search.*product|search.*part/i)).toBeVisible();
  expect(state.calls.filter(call => !['GET', 'OPTIONS'].includes(call.method))).toEqual([]);
});

test('Staff with an assigned POS permission can open the permitted terminal', async ({ page }) => {
  const state = await staffFixture(page, { permissions: [...staffPermissions, 'pos.access'] });
  await page.goto('/#/staff/dashboard');
  await page.getByRole('button', { name: 'Open POS', exact: true }).click();
  await expect(page).toHaveURL(/#\/pos/);
  await expect(page.getByText('Point of Sale', { exact: true })).toBeVisible();
  expect(state.calls.some(call => call.path.startsWith('/pos/') && call.method !== 'GET')).toBe(false);
});

test('permitted Staff fulfillment updates stay within assigned actions using isolated data', async ({ page }) => {
  const state = await staffFixture(page);
  await page.goto('/#/staff/orders');
  const mobile = page.viewportSize().width < 768;
  await page.getByRole('button', { name: mobile ? 'View order' : 'View order #88001', exact: true }).first().click();
  const detail = page.getByRole('dialog', { name: 'Order #88001', exact: true });
  await detail.getByRole('button', { name: 'Update Status', exact: true }).click();
  const status = page.getByRole('dialog', { name: 'Update Order Status', exact: true });
  await expect(status.getByRole('button', { name: 'Cancelled', exact: true })).toHaveCount(0);
  await status.getByRole('button', { name: 'Packed', exact: true }).click();
  await status.getByRole('button', { name: 'Update Status', exact: true }).click();
  await expect(status).toHaveCount(0);
  expect(state.orders[0].status).toBe('packed');
});

test('Staff drawer navigates and closes; account menu sign-out restores focus and ends the session', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await staffFixture(page);
  await page.goto('/#/staff/dashboard');
  const opener = page.getByLabel('Open navigation', { exact: true });
  await opener.click();
  await page.getByRole('dialog', { name: 'Workspace navigation' }).getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page).toHaveURL(/#\/staff\/orders/);
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toHaveCount(0);
  const menu = page.getByLabel('Open profile menu');
  await menu.click();
  await page.locator('.ops-user-popover').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.locator('.ops-user-popover').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/login/);
  expect(state.user).toBeNull();
  await page.goto('/#/staff/inventory');
  await expect(page).toHaveURL(/#\/login/);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('Staff account validates and saves through existing profile/password APIs', async ({ page }) => {
  const state = await staffFixture(page);
  await page.goto('/#/staff/account');
  await page.getByLabel('Full name', { exact: true }).fill('Alex Parts Counter');
  await page.getByRole('button', { name: 'Save account', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Profile updated/ })).toBeVisible();
  expect(state.user.name).toBe('Alex Parts Counter');
  await page.getByLabel('Current password', { exact: true }).fill('OldFixture!23');
  await page.getByLabel('New password', { exact: true }).fill('NewFixture!23');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Mismatch!23');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('New passwords must match.');
  expect(state.calls.some(call => call.path === '/auth/change-password')).toBe(false);
  await page.getByLabel('Confirm new password', { exact: true }).fill('NewFixture!23');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Your password has been changed.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
});

test('Staff drawer sign-out releases scroll and the protected session', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await staffFixture(page);
  await page.goto('/#/staff/dashboard');
  await page.getByLabel('Open navigation', { exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace navigation' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/login/);
  expect(state.user).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('read-only Staff can scan to find parts without catalog or stock edit controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await staffFixture(page, { permissions: ['inventory.view', 'orders.view'] });
  await page.goto('/#/staff/inventory');
  await expect(page.getByRole('button', { name: 'Add Inventory Item' })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Edit Front Brake Pad Set', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Barcode Scan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find a part by barcode' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/#/staff/orders');
  await page.getByRole('button', { name: 'View order #88001', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update Status', exact: true })).toBeDisabled();
});

test('Staff account stays in the operational shell', async ({ page }) => {
  await staffFixture(page);
  await page.goto('/#/staff/dashboard');
  await page.getByLabel('Open profile menu').click();
  await page.getByRole('link', { name: 'Account & security' }).click();
  await expect(page).toHaveURL(/#\/staff\/account/);
  await expect(page.locator('.operations-shell[data-workspace="staff"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff account & security' })).toBeVisible();
});

test('Staff authenticator requires verification before enabling and clears codes on disable', async ({ page }) => {
  const state = await staffFixture(page);
  await page.goto('/#/staff/account');
  await page.getByLabel('Confirm your password', { exact: true }).fill('FixtureOnly!23');
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  expect(state.user.two_factor_enabled).toBe(false);
  await page.getByLabel('Authenticator code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify & enable', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid authenticator code');
  expect(state.user.two_factor_enabled).toBe(false);
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify & enable', exact: true }).click();
  await expect(page.getByText('Recovery codes · save these privately', { exact: true })).toBeVisible();
  expect(state.user.two_factor_enabled).toBe(true);
  await page.getByLabel('Confirm your password', { exact: true }).fill('FixtureOnly!23');
  await page.getByRole('button', { name: 'Disable two-factor authentication', exact: true }).click();
  await expect(page.getByText('Recovery codes · save these privately', { exact: true })).toHaveCount(0);
  expect(state.user.two_factor_enabled).toBe(false);
});

test('shared shell retains the frozen Owner defaults', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await staffFixture(page, { user: { role: 'owner' } });
  await page.goto('/#/admin/dashboard');
  await expect(page.locator('.operations-shell[data-workspace="owner"]')).toBeVisible();
  expect(await page.locator('.operations-sidebar').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(17, 28, 61)');
  await expect(page.locator('.staff-sidebar')).toHaveCount(0);
  await expect(page.locator('.ops-sidebar-footer')).toContainText('10th West operations');
  await page.getByLabel('Open profile menu').click();
  await expect(page.getByRole('link', { name: 'Account & security' })).toHaveAttribute('href', '#/profile?tab=security');
  await page.locator('.ops-user-popover').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.brand-overlay-staff-confirmation')).toHaveCount(0);
});

for (const width of [390, 430, 768, 1024, 1280, 1440]) {
  test(`Staff sign-out is centered and keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await staffFixture(page);
    await page.goto('/#/staff/dashboard');
    const trigger = width < 1024 ? page.getByLabel('Open navigation', { exact: true }) : page.locator('.ops-desktop-sidebar').getByRole('button', { name: 'Sign out', exact: true });
    if (width < 1024) await trigger.click();
    const signout = width < 1024 ? page.getByRole('dialog', { name: 'Workspace navigation' }).getByRole('button', { name: 'Sign out', exact: true }) : trigger;
    await signout.click();
    const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true });
    await expect(dialog).toBeVisible();
    const panel = dialog.locator('.brand-dialog-panel');
    const box = await panel.boundingBox();
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(3);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(3);
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(signout).toBeFocused();
    await signout.click();
    await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Cancel' }).click();
    await expect(signout).toBeFocused();
  });
}
