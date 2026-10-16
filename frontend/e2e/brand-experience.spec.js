import { expect, test } from '@playwright/test';

// Rebrand checks may authenticate, but must never create an order, sale or stock edit.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !/\/auth\/(login|logout|csrf)$/.test(path)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.continue();
  });
});

test('official logo retains its source and containment on storefront and auth pages', async ({ page }) => {
  for (const route of ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email']) {
    await page.goto(`/#${route}`);
    const logo = page.locator('img[src="/brand/10th-west-logo.png"]:visible').first();
    await expect(logo).toBeVisible({ timeout: 20000 });
    await expect(logo).toHaveAttribute('alt', '10th West Motorcycle Parts & Accessories');
    await expect(logo).toHaveCSS('object-fit', 'contain');
    await expect.poll(() => logo.evaluate(image => image.complete && image.naturalWidth === 1230 && image.naturalHeight === 1278)).toBe(true);
  }
});

test('mobile navigation traps focus, closes with Escape and restores its opener', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  const opener = page.getByRole('button', { name: 'Open menu' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('mobile filters use the shared keyboard dialog without leaving the page scroll locked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/shop');
  const opener = page.getByRole('button', { name: /^Filters/ });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Product filters', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('cart drawer has a name and restores keyboard focus on dismissal', async ({ page }) => {
  await page.goto('/#/cart');
  const opener = page.getByRole('button', { name: /Open cart, \d+ items/ });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: /Shopping Cart/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('primary retail action meets text contrast and reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/');
  const action = page.getByRole('link', { name: /^Shop Parts/ });
  await expect(action).toBeVisible();
  const contrast = await action.evaluate(element => {
    const luminance = color => {
      const values = color.match(/\d+/g).slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const style = getComputedStyle(element);
    const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(await action.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.01);
});

test('owner inventory exposes complete part metadata and presentation-only paging', async ({ page }) => {
  test.skip(!process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD, 'Owner fixture credentials required.');
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(process.env.E2E_OWNER_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(process.env.E2E_OWNER_PASSWORD);
  await page.getByRole('button', { name: /^Sign In$/ }).click();
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 30000 });
  await page.goto('/#/admin/inventory');
  const table = page.getByRole('region', { name: 'Inventory stock table' });
  await expect(table).toBeVisible({ timeout: 30000 });
  for (const name of ['Part number', 'Item name', 'Model', 'Color', 'Box location', 'Available stock', 'Minimum stock', 'Store price', 'Online price', 'Status', 'Actions']) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toHaveCount(1);
  }
  await page.getByRole('combobox', { name: 'Sort inventory', exact: true }).selectOption('part_number');
  expect(await table.locator('tbody tr').count()).toBeLessThanOrEqual(20);
  await expect(page.getByRole('navigation', { name: 'Pagination', exact: true })).toContainText('Page 1 of');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Barcode Scan', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});
