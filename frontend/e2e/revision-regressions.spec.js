import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// All APIs are intercepted: no real SMS, account deletion, or inventory writes.
const normal = { id: 98001, name: 'Revision normal part', price: 115, stock_quantity: 3, available_stock: 3, reserved_stock: 2, inventory_status: 'active', status: 'out_of_stock', image: '/images/product-fallback.svg', variants: [], description: 'Test part' };
const variant = { ...normal, id: 98002, name: 'Revision variant part', stock_quantity: 2, available_stock: 2, has_variants: true };
const option = { id: 20, price: 115, stock_quantity: 2, available_stock: 2, option_combination: { Color: 'Black' }, variant_type: 'Color', variant_value: 'Black' };

async function cartFixture(page) {
  await staffFixture(page, { user: { role: 'customer' } });
  const state = { items: [], adds: [] };
  await page.route(/\/api\/products(?:\/\d+)?(?:\?.*)?$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    return route.fulfill({ json: id === 98001 ? normal : id === 98002 ? { ...variant, variants: [option], variant_options: [{ name: 'Color', values: ['Black'] }] } : [normal, variant] });
  });
  await page.route('**/api/wishlist', route => route.fulfill({ json: [{ ...normal, wishlist_id: 999, product_id: normal.id }, { ...variant, wishlist_id: 1000, product_id: variant.id }] }));
  await page.route('**/api/cart**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/cart/add') {
      const payload = route.request().postDataJSON(); state.adds.push(payload);
      if (payload.product_id === variant.id && payload.variant_id !== 20) return route.fulfill({ status: 400, json: { message: 'A product variant is required' } });
      const product = payload.product_id === normal.id ? normal : variant;
      let item = state.items.find(row => row.product_id === payload.product_id && row.variant_id === payload.variant_id);
      if ((item?.quantity || 0) + payload.quantity > product.available_stock) return route.fulfill({ status: 400, json: { message: 'Insufficient stock' } });
      if (item) item.quantity += payload.quantity;
      else { item = { id: state.items.length + 77001, product_id: payload.product_id, variant_id: payload.variant_id, quantity: payload.quantity, product, variant: payload.variant_id ? { id: 20, type: 'Color', value: 'Black' } : null }; state.items.push(item); }
      return route.fulfill({ json: { message: 'Item added to cart successfully' } });
    }
    return route.fulfill({ json: { items: state.items } });
  });
  return state;
}

test('Shop, Wishlist and Product View add the same available item and update one cart line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await cartFixture(page);
  await page.goto('/#/shop');
  await page.locator('.product-card').filter({ hasText: normal.name }).getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect.poll(() => state.items[0]?.quantity).toBe(1);
  await page.evaluate(() => { location.hash = '/wishlist'; });
  const card = page.locator('.group').filter({ has: page.getByRole('link', { name: normal.name, exact: true }) });
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => state.items[0]?.quantity).toBe(2);
  await card.getByRole('link', { name: normal.name, exact: true }).click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => state.items[0]?.quantity).toBe(3);
  expect(state.adds).toEqual(Array.from({ length: 3 }, () => ({ product_id: normal.id, variant_id: null, quantity: 1 })));
  await page.evaluate(() => { location.hash = '/cart'; });
  await expect(page.getByTestId(`cart-row-${normal.id}`)).toBeVisible();
  expect(state.items).toHaveLength(1);
});

test('Shop and Wishlist require variant choice and Product View submits the selected variant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await cartFixture(page);
  await page.goto('/#/shop');
  await page.locator('.product-card').filter({ hasText: variant.name }).getByRole('button', { name: 'Choose options', exact: true }).click();
  await expect(page).toHaveURL(/products\/98002/); expect(state.adds).toHaveLength(0);
  await page.evaluate(() => { location.hash = '/wishlist'; });
  await page.getByRole('button', { name: 'Choose options', exact: true }).click();
  await expect(page).toHaveURL(/products\/98002/); expect(state.adds).toHaveLength(0);
  await page.getByRole('button', { name: /Black/ }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => state.adds.length).toBe(1);
  expect(state.adds[0]).toEqual({ product_id: variant.id, variant_id: option.id, quantity: 1 });
  await expect.poll(() => state.items[0]?.quantity).toBe(1);
});

test('SMS send shows progress, blocks double clicks and restores cooldown on reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.clock.install();
  await staffFixture(page, { user: { role: 'customer', phone: '+639123456789' } });
  let sends = 0, accepted, remaining = 0;
  await page.route('**/api/auth/phone-verification', route => route.fulfill({ json: { available: true, verified: false, resend_after: remaining } }));
  await page.route('**/api/auth/phone-verification/send', async route => {
    sends++; await new Promise(resolve => { accepted = resolve; }); remaining = 45;
    return route.fulfill({ json: { message: 'Verification code accepted for sending. Delivery may take a moment.', resend_after: 60 } });
  });
  await page.goto('/#/profile');
  const send = page.getByRole('button', { name: 'Send verification code', exact: true });
  await send.evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
  await expect.poll(() => sends).toBe(1); accepted();
  await expect(page.getByText(/Sent: Verification code accepted for sending/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: /Resend in 4[45]s/ })).toBeDisabled();
  await page.clock.fastForward(46000); // Simulate a suspended/background tab.
  await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeEnabled();
  expect(sends).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('SMS failure shows a failed state without bypassing server resend cooldown', async ({ page }) => {
  await staffFixture(page, { user: { role: 'customer', phone: '+639123456789' } });
  await page.route('**/api/auth/phone-verification', route => route.fulfill({ json: { available: true, verified: false } }));
  await page.route('**/api/auth/phone-verification/send', route => route.fulfill({ status: 502, json: { message: 'SMS delivery failed. Please try again.', resend_after: 59 } }));
  await page.goto('/#/profile');
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(page.getByText('Failed: SMS delivery failed. Please try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
});
