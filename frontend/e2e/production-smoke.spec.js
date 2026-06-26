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
