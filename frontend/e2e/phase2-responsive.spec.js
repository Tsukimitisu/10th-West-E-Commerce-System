import { expect, test } from '@playwright/test';

const widths = [375, 390, 430, 768, 1024, 1280, 1440];
const shortWidths = [390, 1280];
const captureRoutes = new Set(['/cart', '/register', '/checkout', '/profile', '/admin/reports', '/admin/customers', '/superadmin/users', '/superadmin/audit-logs']);

const checkRoute = async (page, path, viewportWidths) => {
  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
    await page.goto(`/#${path}`);
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect.poll(() => new URL(page.url()).hash).toBe(`#${path}`);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.page, `${path} overflows at ${width}px`).toBeLessThanOrEqual(overflow.viewport + 1);
    if (process.env.E2E_CAPTURE_PHASE2 === 'true' && captureRoutes.has(path) && [390, 1280].includes(width)) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: test.info().outputPath(`${path.slice(1).replaceAll('/', '-')}-${width}.png`) });
    }
  }
};

const login = async (page, email, password) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST', { timeout: 20_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  const response = await responsePromise;
  expect(response.status(), 'Fixture login must succeed before viewport checks').toBe(200);
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });
};

test('public storefront and auth layouts fit required widths', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  for (const route of ['/','/shop','/cart','/login','/register']) {
    await checkRoute(page, route, route === '/cart' || route === '/register' ? widths : shortWidths);
  }
  await checkRoute(page, '/products/0', shortWidths);
});

test('customer account and checkout layouts fit phone and desktop widths', async ({ page }) => {
  test.skip(!process.env.E2E_CUSTOMER_EMAIL || !process.env.E2E_CUSTOMER_PASSWORD, 'Customer fixture credentials are required.');
  test.setTimeout(150_000);
  await login(page, process.env.E2E_CUSTOMER_EMAIL, process.env.E2E_CUSTOMER_PASSWORD);
  for (const route of ['/checkout','/profile','/orders','/messages','/addresses']) {
    await checkRoute(page, route, route === '/checkout' || route === '/profile' ? widths : shortWidths);
  }
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /Tara na sa 10th West/i })).toBeVisible();
  await page.getByRole('button', { name: /^Notifications(?:, \d+ unread)?$/ }).click();
  for (const width of shortWidths) {
    await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth, `Notifications overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
  }
});

test('owner operations layouts fit phone and desktop widths', async ({ page }) => {
  test.skip(!process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD, 'Owner fixture credentials are required.');
  test.setTimeout(180_000);
  await login(page, process.env.E2E_OWNER_EMAIL, process.env.E2E_OWNER_PASSWORD);
  for (const route of ['/admin/dashboard','/admin/inventory','/admin/orders','/admin/reports','/admin/content','/admin/customers','/admin/promotions','/admin/banners','/admin/returns','/pos']) {
    await checkRoute(page, route, route === '/admin/reports' || route === '/admin/customers' ? widths : shortWidths);
  }
});

test('super admin layouts fit phone and desktop widths', async ({ page }) => {
  test.skip(!process.env.E2E_SUPERADMIN_EMAIL || !process.env.E2E_SUPERADMIN_PASSWORD, 'Super Admin fixture credentials are required.');
  test.setTimeout(150_000);
  await login(page, process.env.E2E_SUPERADMIN_EMAIL, process.env.E2E_SUPERADMIN_PASSWORD);
  for (const route of ['/superadmin/dashboard','/superadmin/users','/superadmin/security','/superadmin/audit-logs','/superadmin/maintenance','/superadmin/backup','/superadmin/settings']) {
    await checkRoute(page, route, route === '/superadmin/users' || route === '/superadmin/audit-logs' ? widths : shortWidths);
  }
});
