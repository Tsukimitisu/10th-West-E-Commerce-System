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

  test('staff without permissions receives 403 for sensitive modules', async ({ page }) => {
    await login(page, staffNoPermissions);
    const inventoryResponse = await page.request.get(`${apiUrl}/inventory`);
    expect(inventoryResponse.status()).toBe(403);
    const body = await inventoryResponse.json();
    expect(body.code).toBe('PERMISSION_DENIED');
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
