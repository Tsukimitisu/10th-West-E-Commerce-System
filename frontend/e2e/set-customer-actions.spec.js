import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// All API reads and writes are intercepted. No shared database or provider calls.
const image = name => `/fixture-${name}.svg`;
const option = (id, name, price) => ({ id, name, price, image: image(String(id)), part_number: `PART-${id}`, color: 'Glossy Black', stock_quantity: 5, is_available: true });
const listing = { id: 90, listing_type: 'set', name: 'Mio Fairings Set', description: '<p>Original fairings for your Mio.</p>', motorcycle_model: 'Mio 125', image: image('cover'),
  media: [{ media_type: 'image', url: image('cover') }], options: [option(301, 'Left Panel', 460), option(302, 'Right Panel', 520)],
  price: 460, max_price: 520, stock_quantity: 10, available_item_count: 2, item_count: 2, status: 'active' };
const product = { id: 90, product_id: 90, name: 'Independent product', price: 650, stock_quantity: 4, available_stock: 4, image: image('product'), inventory_status: 'active', visibility_status: 'active' };
const canonical = 'https://10thwestmotoparts.com/sets/90';
const stateForTest = () => ({ favorites: [product], starts: [], adds: [], mutations: [], conversation: null });

async function fixture(page, { state = stateForTest(), loggedOut = false } = {}) {
  await staffFixture(page, { user: { id: 700010, name: 'Fixture Rider', role: 'customer' }, loggedOut });
  await page.routeWebSocket('**/socket.io/**', socket => {
    socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
    socket.onMessage(message => { if (message === '40') socket.send('40{"sid":"fixture"}'); if (message === '2') socket.send('3'); });
  });
  await page.route('**/fixture-*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f36a21"/></svg>' }));
  await page.addInitScript(() => {
    window.fixtureShares = []; window.fixtureCopies = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { if (window.fixtureShareFailure) throw Error('Device share unavailable'); window.fixtureShares.push(data); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.fixtureCopies.push(text) } });
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api/, ''), method = request.method();
    const reply = data => route.fulfill({ json: data });
    if (path === '/ecommerce-listings/public/sets/90') return reply(listing);
    if (path === '/ecommerce-listings/public/sets') return reply([listing]);
    if (path === '/cart') return reply({ items: [] });
    if (path === '/cart/add') { state.adds.push(request.postDataJSON()); return reply({ message: 'Item added to cart successfully' }); }
    if (path === '/wishlist' && method === 'GET') return reply(state.favorites);
    if (path === '/wishlist' && method === 'POST') {
      const body = request.postDataJSON(); state.mutations.push(body);
      expect(body).toEqual({ reference_type: 'storefront_set', listing_id: 90 });
      if (!state.favorites.some(row => row.reference_type === 'storefront_set')) state.favorites.push({ ...listing, id: 'set:90', listing_id: 90, reference_type: 'storefront_set', image_url: listing.image, in_stock: true, is_available: true });
      return reply({ id: 1 });
    }
    if (path === '/wishlist/sets/90' && method === 'DELETE') { state.mutations.push({ removed: 'set:90' }); state.favorites = state.favorites.filter(row => row.reference_type !== 'storefront_set'); return reply({ message: 'Removed' }); }
    if (path === '/chats/product/start') {
      const body = request.postDataJSON(); state.starts.push(body);
      const selected = listing.options.find(row => row.id === body.selected_product_item_id);
      const snapshot = { reference_type: 'storefront_set', listing_id: 90, name: listing.name, image_url: listing.image, url: canonical, price: listing.price,
        ...(selected ? { selected_product_item_id: selected.id, selected_product_item_name: selected.name, selected_product_item_part_number: selected.part_number, selected_product_item_color: selected.color } : {}) };
      state.conversation = { id: 501, product_id: null, customer_id: 700010, product_snapshot: snapshot, subject: listing.name, seller_name: '10th West Moto', status: 'active' };
      return reply({ conversation: state.conversation, created: state.starts.length === 1 });
    }
    if (path === '/chats/my-conversations') return reply({ conversations: state.conversation ? [state.conversation] : [] });
    if (path === '/chats/501/messages') return reply({ conversation: state.conversation, messages: [] });
    if (path === '/products/90') return reply(product);
    return route.fallback();
  });
  return state;
}

for (const width of [390, 768, 1440]) test(`set actions preserve listing and child identities at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 950 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = await fixture(page);
  await page.goto('/sets/90?source=share');
  await expect(page).toHaveURL(/\/#\/sets\/90\?source=share$/);
  await expect(page.getByRole('heading', { name: listing.name, level: 1 })).toBeVisible();
  const favorite = page.getByRole('button', { name: 'Add set to favorites' });
  await favorite.click(); await expect(page.getByRole('button', { name: 'Remove set from favorites' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await expect(page.getByRole('button', { name: 'Remove set from favorites' })).toBeVisible();
  await page.goto('/#/wishlist');
  await expect(page.getByRole('link', { name: listing.name, exact: true }).filter({ hasText: listing.name })).toBeVisible();
  await expect(page.getByText('Fits Mio 125')).toBeVisible();
  await expect(page.getByText('From PHP 460.00')).toBeVisible();
  await page.getByRole('button', { name: `Remove ${listing.name} from wishlist` }).click();
  await expect(page.getByRole('link', { name: listing.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: product.name, exact: true })).toBeVisible();
  expect(state.favorites.map(row => row.product_id)).toEqual([90]);

  await page.goto('/#/sets/90');
  await page.getByRole('button', { name: 'Message Seller' }).click();
  await expect(page).toHaveURL(/#\/messages\?conversation=501$/);
  await expect(page.getByRole('link', { name: listing.name, exact: true })).toHaveAttribute('href', '#/sets/90');
  expect(state.starts[0]).toEqual({ reference_type: 'storefront_set', listing_id: 90 });
  await page.goto('/#/sets/90');
  await page.getByRole('radio', { name: /Right Panel/ }).click();
  await page.getByRole('button', { name: 'Message Seller' }).click();
  await expect(page).toHaveURL(/#\/messages\?conversation=501$/);
  await expect(page.getByText('Right Panel · PART-302 · Glossy Black')).toBeVisible();
  expect(state.starts[1]).toEqual({ reference_type: 'storefront_set', listing_id: 90, selected_product_item_id: 302 });

  await page.goto('/#/sets/90');
  await page.getByRole('radio', { name: /Right Panel/ }).click();
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await share.click();
  await expect.poll(() => page.evaluate(() => window.fixtureShares)).toEqual([{ title: listing.name, text: 'Original fairings for your Mio.', url: canonical }]);
  await page.evaluate(() => { window.fixtureShareFailure = true; }); await share.click();
  await expect(page.getByRole('status').filter({ hasText: 'Set link copied' })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureCopies)).toEqual([canonical]);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${listing.name} | 10th West Moto`);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', 'Original fairings for your Mio.');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/fixture-cover\.svg$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /\/fixture-cover\.svg$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const screenshot = testInfo.outputPath(`set-actions-${width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(`set-actions-${width}`, { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: /Add to cart/i }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add to cart' });
  await expect(sheet.getByRole('radio', { name: /Right Panel/ })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.locator('img').first()).toHaveAttribute('src', /fixture-302\.svg$/);
  await expect(sheet.getByText('₱520.00').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Increase quantity' }).click();
  await sheet.getByTestId('set-purchase-submit').click();
  await expect(sheet.getByRole('status').filter({ hasText: 'Added 2' })).toBeVisible();
  expect(state.adds).toEqual([{ product_id: 302, variant_id: null, quantity: 2, listing_id: 90 }]);
  expect(errors).toEqual([]);
});

test('set favorites synchronize across tabs without changing the colliding product favorite', async ({ page, context }) => {
  const state = stateForTest(); await fixture(page, { state });
  const second = await context.newPage(); await fixture(second, { state });
  await page.goto('/#/sets/90'); await second.goto('/#/sets/90');
  await expect(second.getByRole('button', { name: 'Add set to favorites' })).toBeVisible();
  await page.getByRole('button', { name: 'Add set to favorites' }).click();
  await expect(second.getByRole('button', { name: 'Remove set from favorites' })).toBeVisible();
  await second.getByRole('button', { name: 'Remove set from favorites' }).click();
  await expect(page.getByRole('button', { name: 'Add set to favorites' })).toBeVisible();
  expect(state.favorites).toEqual([product]); await second.close();
});

test('guest set action returns to the same set after customer sign-in', async ({ page }) => {
  await fixture(page, { loggedOut: true }); await page.goto('/sets/90');
  await page.getByRole('button', { name: 'Add set to favorites' }).click();
  await expect(page).toHaveURL(/#\/login\?redirect=%2Fsets%2F90$/);
  await page.getByLabel('Email', { exact: true }).fill('rider@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Fixture-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#\/sets\/90$/);
  await expect(page.getByRole('heading', { name: listing.name, level: 1 })).toBeVisible();
});

test('set action controls fit the responsive page and preserve screenshot evidence', async ({ page }, testInfo) => {
  await fixture(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 }); await page.goto('/#/sets/90');
    await expect(page.getByRole('heading', { name: listing.name, level: 1 })).toBeVisible();
    const actions = page.getByRole('group', { name: 'Set actions', exact: true });
    await actions.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    for (const button of await actions.getByRole('button').all()) {
      const rect = await button.boundingBox(); expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y).toBeGreaterThanOrEqual(73); expect(rect.y + rect.height).toBeLessThanOrEqual(865);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const screenshot = testInfo.outputPath(`set-actions-${width}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`set-actions-${width}`, { path: screenshot, contentType: 'image/png' });
  }
});
