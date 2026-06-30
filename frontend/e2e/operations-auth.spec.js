import { expect, test } from '@playwright/test';

const accounts = [
  { env: 'OWNER', email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD, route: '/#/admin/dashboard', heading: /operations dashboard/i },
  { env: 'STAFF', email: process.env.E2E_STAFF_EMAIL, password: process.env.E2E_STAFF_PASSWORD, route: '/#/staff/dashboard', heading: /good day/i },
  { env: 'SUPERADMIN', email: process.env.E2E_SUPERADMIN_EMAIL, password: process.env.E2E_SUPERADMIN_PASSWORD, route: '/#/superadmin/dashboard', heading: /system overview/i },
];

const login = async (page, account) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(account.email);
  await page.getByPlaceholder('Enter your password').fill(account.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/#\/login/);
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
    });
  });
}
