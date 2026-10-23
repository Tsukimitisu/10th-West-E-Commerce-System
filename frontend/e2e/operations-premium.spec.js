import { expect, test } from '@playwright/test';

const accounts = {
  owner: { env: 'OWNER', route: '/admin/dashboard', heading: /business overview/i },
  staff: { env: 'STAFF', route: '/staff/dashboard', heading: /today.s work/i },
  system: { env: 'SUPERADMIN', route: '/superadmin/dashboard', heading: /system overview/i },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.route('**/api/**', route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !/\/auth\/(login|logout|csrf)$/.test(new URL(request.url()).pathname)) {
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Read-only operational QA: mutation blocked' }) });
    }
    return route.continue();
  });
});

async function login(page, role) {
  const account = accounts[role];
  test.skip(!process.env[`E2E_${account.env}_EMAIL`] || !process.env[`E2E_${account.env}_PASSWORD`], 'Role fixture credentials are required.');
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(process.env[`E2E_${account.env}_EMAIL`]);
  await page.getByPlaceholder('Enter your password').fill(process.env[`E2E_${account.env}_PASSWORD`]);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('heading', { name: account.heading })).toBeVisible({ timeout: 45000 });
}

for (const role of Object.keys(accounts)) {
  test(`${role}: role identity, mobile navigation and account controls`, async ({ page }) => {
    await login(page, role);
    await expect(page.locator(`.operations-shell[data-workspace="${role}"]`)).toBeVisible();
    await expect(page.locator('.operations-topbar summary')).toBeVisible();
    await page.locator('.operations-topbar summary').click();
    await expect(page.getByRole('link', { name: 'Account & security' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ops-user-menu')).not.toHaveAttribute('open', '');
    await page.setViewportSize({ width: 390, height: 844 });
    const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Workspace navigation' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  });
}

test('order filters intersect payment, status and date on structured phone records', async ({ page }) => {
  await login(page, 'owner');
  // Explicit synthetic GET fixture; no order is created or changed.
  await page.route('**/api/orders', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 91001, customer_display_name: 'Fixture Rider A', status: 'processing', payment_method: 'gcash', payment_status: 'paid', created_at: '2026-10-10T02:00:00Z', total_amount: 500 },
      { id: 91002, customer_display_name: 'Fixture Rider B', status: 'pending', payment_method: 'cod', payment_status: 'pending', created_at: '2026-10-11T02:00:00Z', total_amount: 700 },
    ]) }) : route.fallback());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/orders');
  await expect(page.getByRole('heading', { name: 'Fixture Rider A' })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Payment status', { exact: true }).selectOption('paid');
  await page.getByLabel('Order status', { exact: true }).selectOption('processing');
  await page.getByLabel('From', { exact: true }).fill('2026-10-10');
  await page.getByLabel('To', { exact: true }).fill('2026-10-10');
  await expect(page.getByRole('heading', { name: 'Fixture Rider A' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture Rider B' })).toBeHidden();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fixture Rider B' })).toBeVisible();
});

test('audit preserves full details, filters actor and shows absent result honestly', async ({ page }) => {
  await login(page, 'system');
  await page.route('**/api/auth/activity-logs**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [
    { id: 92001, user_name: 'Fixture Operator', action: 'inventory_view', entity_type: 'inventory', entity_id: 'PART-1000', details: { reason: 'Read-only inspection', box: 'A-14' }, created_at: '2026-10-10T02:00:00Z' },
    { id: 92002, user_name: 'Fixture System', action: 'session_expired', result: 'success', created_at: '2026-10-11T02:00:00Z' },
  ], total: 2, page: 1, totalPages: 1 }) }));
  await page.goto('/#/superadmin/audit-logs');
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Actor', { exact: true }).selectOption('Fixture Operator');
  await expect(page.getByText('Fixture System', { exact: true })).toBeHidden();
  await expect(page.locator('.ops-mobile-data-card, .ops-audit-table').getByText('Not recorded', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const detail = page.getByText('View details', { exact: true }).first();
  const phoneDetail = page.getByText('Event details', { exact: true }).first();
  await (await detail.isVisible() ? detail : phoneDetail).click();
  await expect(page.getByText(/reason: Read-only inspection · box: A-14/).filter({ visible: true })).toBeVisible();
});

test('changing an account role requires confirmation before any request', async ({ page }) => {
  await login(page, 'system');
  await page.route('**/api/admin/users?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ id: 93001, name: 'Fixture Staff', email: 'fixture@example.invalid', role: 'store_staff', is_active: true }], total: 1 }) }));
  await page.goto('/#/superadmin/users');
  await page.getByRole('button', { name: 'Actions for Fixture Staff' }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'View account', exact: true }).click();
  await page.getByLabel('Change Role', { exact: true }).selectOption('owner');
  await expect(page.getByRole('dialog', { name: 'Confirm role change' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Confirm role change' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Change Role', { exact: true })).toHaveValue('store_staff');
});

for (const role of ['owner', 'staff']) {
  test(`${role}: cash and COD order details render without a runtime error`, async ({ page }) => {
    await login(page, role);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const orders = ['cash', 'cod'].map((payment_method, index) => ({ id: 94001 + index, customer_display_name: 'Fixture Detail Rider', customer_name: 'Fixture Detail Rider', status: 'processing', payment_method, payment_status: 'paid', created_at: '2026-10-10T02:00:00Z', shipping_address: 'Fixture address', total_amount: 500, items: [] }));
    await page.route('**/api/orders', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orders) }));
    await page.route('**/api/orders/9400*', route => {
      const id = Number(new URL(route.request().url()).pathname.split('/').pop());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orders.find(order => order.id === id) || {}) });
    });
    await page.goto(`/#/${role === 'owner' ? 'admin' : 'staff'}/orders`);
    for (const order of orders) {
      const desktop = page.getByRole('button', { name: `View order #${order.id}`, exact: true });
      await expect(page.getByRole('heading', { name: 'Order management', exact: true })).toBeVisible();
      if (await desktop.isVisible()) await desktop.click();
      else await page.locator('.ops-mobile-data-card').filter({ hasText: `Order #${order.id}` }).getByRole('button', { name: 'View order', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `Order #${order.id}`, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(order.payment_method === 'cash' ? 'Cash' : 'Cash on Delivery', { exact: true }).first()).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    }
    expect(errors).toEqual([]);
  });
}
