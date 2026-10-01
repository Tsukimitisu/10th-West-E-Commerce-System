import { expect, test } from '@playwright/test';

const accounts = [
  { env: 'OWNER', email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD, route: '/#/admin/dashboard', heading: /operations dashboard/i },
  { env: 'STAFF', email: process.env.E2E_STAFF_EMAIL, password: process.env.E2E_STAFF_PASSWORD, route: '/#/staff/dashboard', heading: /good day/i },
  { env: 'SUPERADMIN', email: process.env.E2E_SUPERADMIN_EMAIL, password: process.env.E2E_SUPERADMIN_PASSWORD, route: '/#/superadmin/dashboard', heading: /system overview/i },
];
const apiUrl = (process.env.E2E_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const cashier = {
  email: process.env.E2E_CASHIER_EMAIL,
  password: process.env.E2E_CASHIER_PASSWORD,
};
const staffNoPermissions = {
  email: process.env.E2E_STAFF_NO_PERMS_EMAIL,
  password: process.env.E2E_STAFF_NO_PERMS_PASSWORD,
};
const staffWithPermissions = {
  email: process.env.E2E_STAFF_EMAIL,
  password: process.env.E2E_STAFF_PASSWORD,
};
const disabled = {
  email: process.env.E2E_DISABLED_EMAIL,
  password: process.env.E2E_DISABLED_PASSWORD,
};

const login = async (page, account) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(account.email);
  await page.getByPlaceholder('Enter your password').fill(account.password);
  const loginResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/auth/login') && response.request().method() === 'POST'
  ), { timeout: 20_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });
};

for (const account of accounts) {
  test.describe(`${account.env.toLowerCase()} operations session`, () => {
    test.skip(!account.email || !account.password, `Set E2E_${account.env}_EMAIL and E2E_${account.env}_PASSWORD.`);
    test('authenticates and preserves a guarded deep link', async ({ page }) => {
      await login(page, account);
      await page.goto(account.route);
      await expect(page.getByRole('heading', { name: account.heading })).toBeVisible();
      await page.reload();
      await expect(page).toHaveURL(new RegExp(account.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await expect(page.getByRole('heading', { name: account.heading })).toBeVisible();
      const profileMenu = page.getByRole('button', { name: /open profile menu/i });
      if (!await profileMenu.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /open navigation/i }).click();
      }
      await profileMenu.click();
      await expect(page.getByRole('button', { name: /account & security/i })).toBeVisible();
    });
  });
}

test.describe('owner root landing after browser reopen', () => {
  test.skip(!accounts[0].email || !accounts[0].password, 'Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD.');

  test('restored owner session opens the dashboard from the site root', async ({ context, page }) => {
    await login(page, accounts[0]);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/#/');
    await expect(reopened).toHaveURL(/#\/admin\/dashboard/);
    await expect(reopened.getByRole('heading', { name: /operations dashboard/i })).toBeVisible();
  });

  test('owner can open and leave a conversation in the mobile workspace', async ({ page }) => {
    await login(page, accounts[0]);
    await page.setViewportSize({ width: 390, height: 780 });
    await page.route('**/api/seller/chats**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/read')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else if (path.endsWith('/chats/90001')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          conversation: { id: 90001, buyer_name: 'Layout Test Rider', subject: 'Brake pad question' },
          messages: [],
        }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          conversations: [{ id: 90001, buyer_name: 'Layout Test Rider', subject: 'Brake pad question' }],
        }) });
      }
    });
    await page.goto('/#/admin/chat');
    await expect(page.getByText('Layout Test Rider').first()).toBeVisible();
    await page.getByText('Layout Test Rider').first().click();
    await expect(page.getByPlaceholder('Type a reply')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page.getByPlaceholder('Search customer or product')).toBeVisible();
  });
});

test.describe('cashier operations session', () => {
  test.skip(!cashier.email || !cashier.password, 'Seed or configure the Cashier fixture credentials.');

  test('authenticates into the live POS without granting owner access', async ({ page }) => {
    await login(page, cashier);
    await expect(page).toHaveURL(/#\/pos/);
    await expect(page.getByText('Point of Sale', { exact: true })).toBeVisible();

    const ownerResponse = await page.request.get(`${apiUrl}/reports/sales`);
    expect(ownerResponse.status()).toBe(403);
  });
});

test.describe('live staff permission boundaries', () => {
  test.skip(
    !staffNoPermissions.email || !staffNoPermissions.password
      || !staffWithPermissions.email || !staffWithPermissions.password,
    'Seed or configure both Staff fixture credential sets.'
  );

  test('staff without permissions receives 403 across sensitive modules', async ({ page }) => {
    await login(page, staffNoPermissions);
    const deniedModules = [
      ['orders', '/orders'],
      ['inventory', '/inventory'],
      ['POS', '/pos/products'],
      ['reports', '/reports/sales'],
      ['payments', '/payments/0/status'],
      ['staff management', '/staff'],
      ['settings', '/admin/settings'],
      ['audit logs', '/auth/activity-logs'],
    ];

    for (const [moduleName, path] of deniedModules) {
      const response = await page.request.get(`${apiUrl}${path}`);
      expect(response.status(), `${moduleName} must be denied`).toBe(403);
    }

    const csrfResponse = await page.request.get(`${apiUrl}/csrf-token`);
    expect(csrfResponse.status()).toBe(200);
    const { csrfToken } = await csrfResponse.json();
    const productMutation = await page.request.post(`${apiUrl}/products/upload-image`, {
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      data: {},
    });
    expect(productMutation.status(), 'product management must be denied').toBe(403);
  });

  test('staff allow-list succeeds while an unassigned module remains 403', async ({ page }) => {
    await login(page, staffWithPermissions);
    const inventoryResponse = await page.request.get(`${apiUrl}/inventory`);
    expect(inventoryResponse.status()).toBe(200);

    const reportsResponse = await page.request.get(`${apiUrl}/reports/sales`);
    expect(reportsResponse.status()).toBe(403);
    const body = await reportsResponse.json();
    expect(body.code).toBe('PERMISSION_DENIED');
  });
});

test.describe('disabled account fixture', () => {
  test.skip(!disabled.email || !disabled.password, 'Seed or configure the Disabled fixture credentials.');

  test('refuses login without exposing account or database details', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
    await page.goto('/#/login');
    await page.getByPlaceholder('name@example.com').fill(disabled.email);
    await page.getByPlaceholder('Enter your password').fill(disabled.password);
    const responsePromise = page.waitForResponse((response) => (
      response.url().includes('/api/auth/login') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: /sign in/i }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(403);
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByText(/account is currently unavailable/i)).toBeVisible();
  });
});
