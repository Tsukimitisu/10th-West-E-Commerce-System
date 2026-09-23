import { expect, test } from '@playwright/test';

const staff = { email: process.env.E2E_STAFF_EMAIL, password: process.env.E2E_STAFF_PASSWORD };
const owner = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const customer = { email: process.env.E2E_CUSTOMER_EMAIL, password: process.env.E2E_CUSTOMER_PASSWORD };
const item = {
  id: 7, partNumber: 'BB3-123', itemName: 'Mio Side Panel', color: 'Black', price: 350,
  stockQuantity: 12, lowStockThreshold: 3, boxNumber: 'Box A-01', storageLocation: 'Shelf 2',
  brand: 'Yamaha', motorcycleModel: 'Mio', category: 'Body Parts', status: 'active',
};

const login = async (page, account) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(account.email);
  await page.getByPlaceholder('Enter your password').fill(account.password);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /sign in/i }).click();
  expect((await responsePromise).status()).toBe(200);
};

test.describe('staff inventory product items browser', () => {
  test.skip(!staff.email || !staff.password, 'Staff fixture credentials are required.');

  test('shows inventory fields, searches, empty and error states, and has no mutations', async ({ page }) => {
    await login(page, staff);
    await expect(page).toHaveURL(/#\/staff/);
    const liveResponse = await page.request.get(`${process.env.E2E_API_URL || 'http://localhost:5000/api'}/inventory/product-items?page=1&pageSize=1`);
    expect(liveResponse.status()).toBe(200);
    expect((await liveResponse.json()).items).toEqual(expect.any(Array));
    let releaseInitialRequests;
    const initialGate = new Promise((resolve) => { releaseInitialRequests = resolve; });
    let holdInitialRequests = true;
    await page.route('**/api/inventory/product-items?*', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') || '';
      if (holdInitialRequests && !query) await initialGate;
      if (query === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Failure' }) });
      const items = !query || ['BB3', 'Mio'].some((value) => query.toLowerCase().includes(value.toLowerCase())) ? [item] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, total: items.length, page: 1, pageSize: 20 }) });
    });
    await page.getByRole('button', { name: 'Product Items' }).click();
    await expect(page).toHaveURL(/#\/staff\/inventory\/product-items/);
    try {
      await expect(page.getByText('Loading product items...')).toBeVisible();
    } finally {
      holdInitialRequests = false;
      releaseInitialRequests();
    }
    await expect(page.getByRole('heading', { name: 'Product Items' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'BB3-123' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Mio Side Panel' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Black' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /₱350\.00/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Box A-01 / Shelf 2' })).toBeVisible();
    for (const action of ['Add', 'Edit', 'Delete']) await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0);
    const search = page.getByRole('searchbox', { name: 'Search inventory' });
    await search.fill('BB3');
    await expect(page.getByRole('cell', { name: 'BB3-123' })).toBeVisible();
    await search.fill('Mio');
    await expect(page.getByRole('cell', { name: 'Mio Side Panel' })).toBeVisible();
    await search.fill('nothing');
    await expect(page.getByText('No product items found.')).toBeVisible();
    await search.fill('error');
    await expect(page.getByRole('alert')).toContainText('Unable to load product items. Please try again.');
  });
});

test.describe('owner inventory product items browser', () => {
  test.skip(!owner.email || !owner.password, 'Owner fixture credentials are required.');
  test('can open the read-only page', async ({ page }) => {
    await login(page, owner);
    await page.goto('/#/admin/inventory/product-items');
    await expect(page.getByRole('heading', { name: 'Product Items' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Product Items' })).toBeVisible();
  });
});

test.describe('customer inventory access', () => {
  test.skip(!customer.email || !customer.password, 'Customer fixture credentials are required.');
  test('cannot open the staff product items route', async ({ page }) => {
    await login(page, customer);
    await page.goto('/#/staff/inventory/product-items');
    await expect(page).not.toHaveURL(/#\/staff\/inventory\/product-items/);
    await expect(page.getByRole('heading', { name: 'Product Items' })).toHaveCount(0);
  });
});
