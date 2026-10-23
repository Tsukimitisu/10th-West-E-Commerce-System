import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { customerFixture } from './customerPhaseFixture.js';

// Every API is intercepted by the existing fixtures; no live account/business writes.
const homes = { owner: '/admin/dashboard', admin: '/admin/dashboard', store_staff: '/staff/dashboard', super_admin: '/superadmin/dashboard', cashier: '/pos' };
for (const [role, home] of Object.entries(homes)) {
  test(`${role} cannot enter Customer View via direct URL, reload, history or returnTo`, async ({ page }) => {
    await staffFixture(page, { user: { role }, permissions: ['pos.access', 'orders.view', 'inventory.view'] });
    await page.route('**/api/health', route => route.fulfill({ json: { status: 'OK' } }));
    await page.goto('/#/profile');
    await expect(page).toHaveURL(new RegExp(`#${home}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`#${home}$`));
    for (const path of ['/cart', '/orders/88001', '/checkout', '/shop', '/login?redirect=%2Fprofile&returnTo=%2Fcart']) {
      await page.evaluate(path => { window.location.hash = path; }, path);
      await expect(page).toHaveURL(new RegExp(`#${home}$`));
    }
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(new RegExp(`#${home}$`));
    await page.evaluate(() => window.history.forward());
    await expect(page).toHaveURL(new RegExp(`#${home}$`));
    await expect(page.locator('.customer-surface')).toHaveCount(0);
    await page.evaluate(() => sessionStorage.setItem('oauth_return_to', '/profile?returnTo=//evil.test'));
    await page.goto('/#/oauth-callback?status=success');
    await expect(page).toHaveURL(new RegExp(`#${home}$`));
  });
}

async function notifications(page, rows) {
  const state = rows.map(row => ({ is_read: false, created_at: '2026-10-24T01:00:00Z', ...row }));
  await page.route('**/api/notifications**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/unread-count')) return route.fulfill({ json: { count: state.filter(row => !row.is_read).length } });
    if (path.endsWith('/read')) {
      state.find(row => String(row.id) === path.split('/').at(-2)).is_read = true;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: state });
  });
  return state;
}

test('customer notification marks read, closes dropdown and opens exact order after refresh', async ({ page }) => {
  await customerFixture(page, { authenticated: true });
  const rows = await notifications(page, [{ id: 1, title: 'Your order update', type: 'order_status', reference_type: 'order', reference_id: 88001 }]);
  await page.goto('/#/orders');
  await page.reload();
  await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
  await page.getByRole('button', { name: /Your order update/ }).click();
  await expect(page).toHaveURL(/#\/orders\/88001$/);
  expect(rows[0].is_read).toBe(true);
  await expect(page.locator('.customer-notification-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeAttached();
});

for (const role of ['owner', 'store_staff']) {
  test(`${role} notification opens exact order and inaccessible record falls back`, async ({ page }) => {
    const fixture = await staffFixture(page, { user: { role } });
    const base = role === 'owner' ? '/admin' : '/staff';
    const rows = await notifications(page, [
      { id: 1, title: 'Open selected order', reference_type: 'order', reference_id: 88002 },
      { id: 2, title: 'Deleted order', reference_type: 'order', reference_id: 99999 },
    ]);
    await page.route('**/api/orders/*', route => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1);
      const row = fixture.orders.find(item => String(item.id) === id);
      return route.fulfill({ status: row ? 200 : 404, json: row || { message: 'Order unavailable' } });
    });
    await page.goto(`/#${base}/dashboard`);
    await page.getByRole('button', { name: 'Notifications, 2 unread', exact: true }).click();
    await page.getByRole('button', { name: /Open selected order/ }).click();
    await expect(page).toHaveURL(new RegExp(`#${base}/orders\\?order=88002$`));
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('88002');
    expect(rows[0].is_read).toBe(true);
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Close/ }).last().click();
    await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
    await page.getByRole('button', { name: /Deleted order/ }).click();
    await expect(page).toHaveURL(new RegExp(`#${base}/notifications$`));
    expect(rows[1].is_read).toBe(true);
    await expect(page.locator('button[aria-label="Notifications"]')).toBeVisible();
  });
}

test('system notification uses system security, never customer account', async ({ page }) => {
  await staffFixture(page, { user: { role: 'super_admin' } });
  await notifications(page, [{ id: 1, title: 'Security alert', type: 'security_alert' }]);
  await page.goto('/#/superadmin/dashboard');
  await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
  await page.getByRole('button', { name: /Security alert/ }).click();
  await expect(page).toHaveURL(/#\/superadmin\/security$/);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});

function contrast(a, b) {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

for (const width of [390, 768, 1440]) {
  test(`auth helper text is readable without overflow at ${width}px`, async ({ page }, testInfo) => {
    await staffFixture(page, { loggedOut: true });
    await page.route('**/api/auth/verify-reset-token', route => route.fulfill({ json: { valid: true, expires_at: new Date(Date.now() + 600000).toISOString() } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/reset-password?token=mock-one-time-token');
    const notice = page.locator('.auth-info-dark');
    await expect(notice).toBeVisible();
    const style = await notice.evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, color: getComputedStyle(element.querySelector('p')).color, size: parseFloat(getComputedStyle(element.querySelector('p')).fontSize) }));
    expect(contrast(style.bg, style.color)).toBeGreaterThanOrEqual(4.5);
    expect(style.size).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`reset-${width}.png`), fullPage: true, animations: 'disabled' });
    const eye = page.getByRole('button', { name: 'Show password', exact: true });
    await expect(eye).toBeVisible();
    await eye.click();
    await expect(page.locator('#reset-new-password')).toHaveAttribute('type', 'text');
    for (const path of ['/forgot-password', '/verify-email']) {
      await page.goto(`/#${path}`);
      await expect(page.locator('.auth-content')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const lightText = page.locator('.auth-content .text-gray-400').first();
      if (await lightText.count()) {
        const ink = await lightText.evaluate(element => getComputedStyle(element).color);
        expect(contrast(ink, 'rgb(255,255,255)')).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}
