import { test, expect } from '@playwright/test';
import { customerFixture, fixtureProduct } from './customerPhaseFixture.js';
import { ownerFixture } from './ownerPhaseFixture.js';

// Every API request is intercepted (fixtures + overrides below). No cart,
// listing or carousel write reaches the shared database.
const option = (id, name, patch = {}) => ({ id, name, part_number: `M3-${id}`, color: 'Glossy Black', image: '/images/product-fallback.svg', price: 460, stock_quantity: 5, sort_order: id, is_available: true, unavailable_reason: null, ...patch });
const fixtureSet = {
  id: 90, listing_type: 'set', name: 'Mio 125 M3 Fairings - Glossy Black', description: '<p>Complete fairing set.</p>', motorcycle_model: 'Mio 125',
  image: '/images/product-fallback.svg', media: [{ url: '/images/product-fallback.svg', media_type: 'image', sort_order: 0 }],
  options: [option(301, 'Coverside LEFT SIDE'), option(302, 'Coverside RIGHT SIDE', { price: 520 }), option(303, 'Front Fender', { stock_quantity: 0, is_available: false, unavailable_reason: 'Out of stock' })],
  price: 460, max_price: 520, stock_quantity: 10, item_count: 3, available_item_count: 2, status: 'active', keywords: [],
};

async function setRoutes(page, { addDelay = 0 } = {}) {
  const adds = [];
  await page.route('**/api/ecommerce-listings/public/sets**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/sets')) return route.fulfill({ json: [{ ...fixtureSet, options: undefined }] });
    return path.endsWith('/90') ? route.fulfill({ json: fixtureSet }) : route.fulfill({ status: 404, json: { message: 'This set is not available.' } });
  });
  await page.route('**/api/cart/add', async (route) => {
    adds.push(route.request().postDataJSON());
    if (addDelay) await new Promise((resolve) => setTimeout(resolve, addDelay));
    return route.fulfill({ json: { message: 'Item added to cart successfully' } });
  });
  return adds;
}

test('only the clicked Shop card shows Adding… and a double click adds once', async ({ page }) => {
  await customerFixture(page);
  const products = [1, 2, 3].map((n) => ({ ...fixtureProduct, id: 98000 + n, name: `Fixture Part ${n}`, part_number: `FX-${n}` }));
  await page.route('**/api/products', (route) => route.fulfill({ json: products }));
  const adds = await setRoutes(page, { addDelay: 900 });
  await page.goto('/#/shop');
  const card = (name) => page.locator('article.product-card', { hasText: name });
  await expect(card('Fixture Part 2')).toBeVisible({ timeout: 15000 });
  const target = card('Fixture Part 2').getByRole('button', { name: /Add to cart/i });
  await target.dblclick();
  await expect(card('Fixture Part 2').locator('[data-cart-state="pending"]')).toContainText('Adding…');
  for (const name of ['Fixture Part 1', 'Fixture Part 3']) {
    await expect(card(name).locator('[data-cart-state="idle"]')).toBeEnabled();
    await expect(card(name)).not.toContainText('Adding…');
  }
  await expect(card('Fixture Part 2').locator('[data-cart-state="added"]')).toBeVisible({ timeout: 8000 });
  expect(adds.filter((body) => body.product_id === 98002)).toHaveLength(1);
  await expect(card('Fixture Part 2').getByRole('link', { name: 'Fixture Part 2', exact: true })).toBeVisible();
  await expect(card('Mio 125 M3 Fairings - Glossy Black')).toContainText('Choose item');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`set selector adds the real child item at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await customerFixture(page);
    const adds = await setRoutes(page, { addDelay: 300 });
    await page.goto('/#/sets/90');
    await expect(page.getByRole('heading', { name: fixtureSet.name, level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('From ₱460.00').first()).toBeVisible();
    await page.getByRole('button', { name: /Add to cart/i }).filter({ visible: true }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Add to cart' });
    await expect(sheet).toBeVisible();
    const radios = sheet.getByRole('radio');
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(2)).toHaveAttribute('aria-disabled', 'true');
    await radios.nth(2).click({ force: true });
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'false');
    await radios.nth(1).click();
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByText('₱520.00').first()).toBeVisible();
    await sheet.getByRole('button', { name: 'Increase quantity' }).click();
    await sheet.getByTestId('set-purchase-submit').click();
    await expect(sheet.getByTestId('set-purchase-submit')).toContainText('Adding…');
    await expect(sheet.getByText('Added 2 × Coverside RIGHT SIDE to cart.')).toBeVisible();
    expect(adds).toEqual([{ product_id: 302, variant_id: null, quantity: 2, listing_id: 90 }]);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });
}

test('set Buy Now carries the real child item into the existing Buy Now flow', async ({ page }) => {
  await customerFixture(page);
  await setRoutes(page);
  await page.goto('/#/sets/90');
  await page.getByRole('button', { name: 'Buy Now' }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Buy now' });
  await sheet.getByRole('radio', { name: /Coverside LEFT SIDE/ }).click();
  await sheet.getByTestId('set-purchase-submit').click();
  await expect(page).toHaveURL(/login\?redirect=\/checkout&buyNow=1/);
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shopCoreBuyNowSession')));
  expect(session.item.productId).toBe(301);
  expect(session.item.quantity).toBe(1);
  expect(session.returnPath).toBe('/sets/90');
});

test('unavailable set shows an intentional not-available state', async ({ page }) => {
  await customerFixture(page);
  await setRoutes(page);
  await page.goto('/#/sets/404');
  await expect(page.getByText('This set is not available')).toBeVisible({ timeout: 15000 });
});

test('hero CTA links to the set page in-app; a no-link slide has no CTA', async ({ page }) => {
  await customerFixture(page, { banners: [
    { id: 1, title: 'Full fairing sets', subtitle: 'Pick the panel you need.', image_url: '/brand/ride-detail.webp', button_text: 'View Set', link_url: '/sets/90', is_active: true, display_order: 1 },
    { id: 2, title: 'Shop hours update', subtitle: 'Information only.', image_url: '/brand/ride-detail.webp', button_text: 'Ignored', link_url: '', is_active: true, display_order: 2 },
  ] });
  await setRoutes(page);
  await page.goto('/#/');
  const cta = page.getByRole('link', { name: 'View Set', exact: true });
  await expect(cta).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: 'Ignored' })).toHaveCount(0);
  await cta.click();
  await expect(page).toHaveURL(/#\/sets\/90$/);
  await expect(page.getByRole('heading', { name: fixtureSet.name, level: 1 })).toBeVisible();
});

test('owner creates a set listing from multiple existing items and links it from the hero', async ({ page }) => {
  const state = await ownerFixture(page, { slides: [] });
  const inventory = [
    { id: 301, name: 'Coverside LEFT SIDE', product_name: 'Coverside LEFT SIDE', part_number: 'M3-301', color: 'Glossy Black', motorcycle_model: 'Mio 125', stock_quantity: 5, store_selling_price: 400, ecommerce_price: 460, inventory_status: 'active' },
    { id: 302, name: 'Coverside RIGHT SIDE', product_name: 'Coverside RIGHT SIDE', part_number: 'M3-302', color: 'Glossy Black', motorcycle_model: 'Mio 125', stock_quantity: 3, store_selling_price: 450, ecommerce_price: 517.5, inventory_status: 'active' },
  ];
  const posts = [];
  await page.route('**/api/inventory**', (route) => route.fulfill({ json: inventory }));
  await page.route('**/api/motorcycle-models**', (route) => route.fulfill({ json: { models: [{ id: 4, model_name: 'Mio 125', status: 'active' }] } }));
  await page.route('**/api/ecommerce-listings', (route) => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { listing: { id: 90 } } }); }
    return route.fulfill({ json: [] });
  });
  await page.goto('/#/admin/storefront');
  await page.getByRole('button', { name: 'Add Set Listing' }).click();
  const editor = page.getByRole('dialog', { name: 'Add Set Listing' });
  await editor.getByLabel('Set title').fill('Mio 125 M3 Fairings - Glossy Black');
  await editor.getByLabel('Motorcycle model (compatibility)').selectOption('4');
  await editor.getByRole('button', { name: 'Add Items' }).click();
  const picker = page.getByRole('dialog', { name: 'Add items to set' });
  await picker.getByPlaceholder(/Search part number/).fill('M3-30');
  await picker.getByRole('button', { name: /Add to set/ }).first().click();
  await picker.getByRole('button', { name: /Add to set/ }).first().click();
  await picker.getByRole('button', { name: /Done · 2 selected/ }).click();
  await editor.getByRole('button', { name: 'Move Coverside RIGHT SIDE up' }).click();
  await editor.getByRole('button', { name: 'Save Listing' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ listing_type: 'set', title: 'Mio 125 M3 Fairings - Glossy Black', motorcycle_model_id: 4, items: [302, 301], visibility_status: 'draft' });
  expect(posts[0]).not.toHaveProperty('price');

  await page.route('**/api/banners/destinations**', (route) => route.fulfill({ json: { products: [], promotions: [], categories: [], models: [], sets: [{ id: 90, name: 'Mio 125 M3 Fairings - Glossy Black', motorcycle_model: 'Mio 125', item_count: 2 }], hasMoreSets: false } }));
  await page.goto('/#/admin/hero-carousel');
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  const slide = page.getByRole('dialog', { name: 'Create hero slide', exact: true });
  await slide.getByRole('combobox', { name: 'Destination type', exact: true }).selectOption('set');
  await slide.getByRole('button', { name: /Mio 125 M3 Fairings/ }).click();
  await expect(slide.getByRole('button', { name: /Mio 125 M3 Fairings/ })).toHaveAttribute('aria-pressed', 'true');
  expect(state.writes).toHaveLength(0);
});
