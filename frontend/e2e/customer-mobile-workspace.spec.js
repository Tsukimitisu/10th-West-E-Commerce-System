import { expect, test } from '@playwright/test';

// Keep role/session smoke checks away from shared cart/order/payment writes.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/cart')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !/\/auth\/(login|logout|csrf)$/.test(path)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
});


const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

test.skip(!customerEmail || !customerPassword, 'Set customer fixture credentials for mobile workspace checks.');

test('customer mobile chat keeps the footer out and opens a full-width conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.route('**/api/chats/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/my-conversations')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        conversations: [{ id: 90002, subject: 'Brake Pad Test', seller_name: '10th West Moto' }],
      }) });
    } else if (path.endsWith('/read')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        conversation: { id: 90002, subject: 'Brake Pad Test', seller_name: '10th West Moto' }, messages: [],
      }) });
    }
  });
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(customerEmail);
  await page.getByPlaceholder('Enter your password').fill(customerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/#\/login/);
  await page.goto('/#/messages');
  await expect(page.getByPlaceholder('Search chats')).toBeVisible();
  await expect(page.getByPlaceholder('Type a message')).toBeHidden();
  await expect(page.locator('footer')).toHaveCount(0);
  await page.getByRole('button', { name: /Brake Pad Test/ }).click();
  await expect(page.getByPlaceholder('Type a message')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(page.getByPlaceholder('Search chats')).toBeVisible();
});

test('customer notification panel fits a phone with long content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.route('**/api/notifications', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: 90003, title: 'Shipping update for your motorcycle parts order',
      message: 'Your order is being prepared for pickup at the distribution center and a waybill will follow.',
      created_at: '2026-09-12T08:00:00.000Z', is_read: false,
    }]),
  }));
  await page.route('**/api/notifications/unread-count', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1 }),
  }));
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(customerEmail);
  await page.getByPlaceholder('Enter your password').fill(customerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/#\/login/);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Shipping update for your motorcycle parts order')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
