import { expect, test } from '@playwright/test';

const expectNoPageErrors = async (page, run) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await run();
  expect(pageErrors).toEqual([]);
};

test('public storefront shell loads', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/#/');
    await expect(page.locator('body')).toContainText(/10th west|moto|shop/i);
  });
});

test('shop route renders without authentication', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/#/shop');
    await expect(page).toHaveURL(/#\/shop/);
    await expect(page.locator('body')).toContainText(/shop|product|parts|loading/i);
  });
});

test('shop route shows a distinct product API error state', async ({ page }) => {
  await page.route('**/api/products*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'DATABASE_UNAVAILABLE', message: 'Unavailable' }),
  }));
  await page.goto('/#/shop');
  await expect(page.getByText('The catalog is temporarily unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('shop route shows a truthful empty catalog state', async ({ page }) => {
  await page.route('**/api/products*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route('**/api/categories*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.goto('/#/shop');
  await expect(page.getByText('No products are available yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('cart route renders without authentication', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/#/cart');
    await expect(page).toHaveURL(/#\/cart/);
    await expect(page.locator('body')).toContainText(/cart|checkout|shopping/i);
  });
});

test('protected customer route redirects anonymous users to login', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/#/profile');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.locator('body')).toContainText(/sign in|welcome back/i);
  });
});

test('protected admin route redirects anonymous users to login', async ({ page }) => {
  await expectNoPageErrors(page, async () => {
    await page.goto('/#/admin');
    await expect(page).toHaveURL(/#\/login/);
  });
});
