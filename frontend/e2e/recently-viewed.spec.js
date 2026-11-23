import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

const part = { id: 98001, name: 'Live brake pad', price: 115, stock_quantity: 3, available_stock: 3, inventory_status: 'active', visibility_status: 'active', image: '/images/product-fallback.svg', variants: [] };
const other = { ...part, id: 98002, name: 'Live oil filter' };
const recent = page => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Recently viewed', exact: true }) });

async function fixture(page, products, history) {
  await staffFixture(page, { loggedOut: true });
  await page.addInitScript(raw => {
    if (!sessionStorage.getItem('recent-fixture-seeded')) {
      localStorage.setItem('recentlyViewed', raw);
      sessionStorage.setItem('recent-fixture-seeded', 'true');
    }
  }, typeof history === 'string' ? history : JSON.stringify(history));
  const state = { views: 0 };
  await page.route(/\/api\/products(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: products });
    if (/\/views?$/.test(path)) { state.views++; return route.fulfill({ json: { success: true } }); }
    if (/\/variants$/.test(path)) return route.fulfill({ json: { options: [], variants: [] } });
    const match = path.match(/^\/api\/products\/(\d+)$/);
    if (match) {
      const product = products.find(row => row.id === Number(match[1]));
      return route.fulfill({ status: product ? 200 : 404, json: product || { message: 'Product not found' } });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}

test('recent history renders fresh live data and removes deleted/unavailable snapshots', async ({ page }) => {
  await fixture(page, [part, other, { ...part, id: 98003, is_deleted: true }, { ...part, id: 98004, visibility_status: 'hidden' }],
    [{ ...part, name: 'Stale cached name', price: 1 }, { id: 99999, name: 'Deleted cached product' }, 98003, 98004, 98002, 98001]);
  await page.goto('/#/');
  await expect(recent(page).getByText('Live brake pad', { exact: true })).toBeVisible();
  await expect(recent(page).getByText('Live oil filter', { exact: true })).toBeVisible();
  await expect(page.getByText('Stale cached name', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Deleted cached product', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentlyViewed')))).toEqual([98001,98002]);
});

test('empty live catalog clears old history and hides Recently viewed', async ({ page }) => {
  await fixture(page, [], [{ ...part, name: 'Old deleted part' }]);
  await page.goto('/#/');
  await expect(page.getByText('No products are available yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently viewed', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('recentlyViewed'))).toBeNull();
});

test('corrupt history is cleaned without crashing the storefront', async ({ page }) => {
  await fixture(page, [part], '{corrupt');
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'New arrivals', exact: true })).toBeVisible();
  await expect(recent(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recentlyViewed'))).toBeNull();
});

test('recentlyViewedUpdated refreshes live products and normalized IDs survive reload', async ({ page }) => {
  await fixture(page, [part, other], [98001]);
  await page.goto('/#/');
  await expect(recent(page).getByText(part.name, { exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('recentlyViewed', JSON.stringify([98002,99999]));
    window.dispatchEvent(new Event('recentlyViewedUpdated'));
  });
  await expect(recent(page).getByText(other.name, { exact: true })).toBeVisible();
  await expect(recent(page).getByText(part.name, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(recent(page).getByText(other.name, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentlyViewed')))).toEqual([98002]);
});

test('missing Product Detail clears prior product actions and removes its stale ID without changing view analytics', async ({ page }) => {
  const state = await fixture(page, [part], [99999]);
  await page.goto('/#/products/98001');
  await expect(page.getByRole('heading', { name: part.name, exact: true })).toBeVisible();
  await expect.poll(() => state.views).toBe(1);
  await page.evaluate(() => { location.hash = '/products/99999'; });
  await expect(page.getByText('Product not found', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentlyViewed')))).toEqual([98001]);
  expect(state.views).toBe(1);
});
