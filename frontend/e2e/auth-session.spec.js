import { expect, test } from '@playwright/test';

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
const customerTotp = process.env.E2E_CUSTOMER_TOTP;

test.describe('credential-gated auth session checks', () => {
  test.skip(!customerEmail || !customerPassword, 'Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run live auth checks.');

  test('customer sign-in creates an HttpOnly backend session cookie', async ({ context, page }) => {
    await page.goto('/#/login');
    await page.getByPlaceholder('name@example.com').fill(customerEmail);
    await page.getByPlaceholder('Enter your password').fill(customerPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    if (customerTotp && await page.getByPlaceholder('000000').isVisible().catch(() => false)) {
      await page.getByPlaceholder('000000').fill(customerTotp);
      await page.getByRole('button', { name: /verify code/i }).click();
    }

    await expect(page).not.toHaveURL(/#\/login/);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === 'twm.sid');
    expect(sessionCookie, 'twm.sid cookie should be issued by the backend').toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
  });
});
