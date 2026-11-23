import { test, expect } from '@playwright/test';
import { customerFixture, fixtureOrder } from './customerPhaseFixture.js';
import { staffFixture } from './staffPhaseFixture.js';

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const photo = (page, name) => page.screenshot({ path: `test-results/hotfix-${name}.png`, fullPage: true });

for (const width of [390, 768, 1440]) {
  test(`customer navigation, product and confirmation at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await customerFixture(page, { authenticated: true, orders: [{ ...fixtureOrder, total_amount: 1150 }] });
    state.product.variants = [
      { id: 71, option_combination: { Color: 'Black' }, price: 500, stock_quantity: 2, sku: 'PART-BLK' },
      { id: 72, option_combination: { Color: 'Orange' }, price: 550, stock_quantity: 0, sku: 'PART-ORG' },
    ];
    await page.goto('/#/profile');
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toBeVisible();
    await expect(page.locator('.operations-sidebar')).toHaveCount(0);
    await noOverflow(page);
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
      await trigger.click();
      const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
      await expect(menu.getByRole('link', { name: 'Messages', exact: true })).toBeVisible();
      await expect.poll(async () => (await menu.locator('.brand-dialog-panel').boundingBox()).y).toBeGreaterThanOrEqual(72);
      const box = await menu.locator('.brand-dialog-panel').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(72);
      expect(box.height).toBeLessThan(500);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      await page.keyboard.press('Tab');
      expect(await menu.evaluate(node => node.contains(document.activeElement))).toBe(true);
      await photo(page, `menu-${width}`);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole('button', { name: 'Close dialog', exact: true }).click({ position: { x: 5, y: 900 } });
      await expect(menu).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    }
    await photo(page, `account-${width}`);
    await page.goto('/#/products/98001');
    await expect(page.getByRole('heading', { name: state.product.name, exact: true })).toBeVisible();
    if (width < 768) {
      await page.locator('.product-mobile-purchase-bar').getByRole('button', { name: 'Add to cart', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Add to cart', exact: true });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('button', { name: /Orange/ })).toBeDisabled();
      await sheet.getByRole('button', { name: /Black/ }).click();
      await sheet.getByRole('button', { name: 'Increase quantity' }).click();
      await expect(sheet.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
      await expect(sheet.getByLabel('Quantity', { exact: true })).toHaveText('2');
      await photo(page, `options-${width}`);
      await page.keyboard.press('Escape');
      await page.locator('.product-mobile-purchase-bar').getByRole('button', { name: 'Buy Now', exact: true }).click();
      await page.getByRole('dialog', { name: 'Buy now', exact: true }).getByRole('button', { name: 'Buy Now', exact: true }).click();
      const selection = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shopCoreBuyNowSession')));
      expect(selection.item.product.selected_variant.id).toBe(71);
      expect(selection.item.quantity).toBe(2);
    } else {
      await page.getByRole('button', { name: /Black PART-BLK/ }).click();
      await expect(page.getByRole('button', { name: /Orange PART-ORG/ })).toBeDisabled();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await photo(page, `product-${width}`);
    }
    await page.goto('/#/order-confirmation/88001');
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
    await expect(page.getByText('#TW-2026-88001', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: state.product.name, exact: true })).toBeVisible();
    for (const name of ['Track Order', 'Continue Shopping', 'Go Home']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Invoice' })).toBeVisible();
    await expect(page.getByText('VAT', { exact: true })).toHaveCount(0);
    await noOverflow(page);
    await photo(page, `confirmation-${width}`);
    expect(state.writes.filter(call => /checkout|orders/.test(call.path))).toHaveLength(0);
  });
}

test('payment redirect ignores query success/failure and polls pending into confirmed', async ({ page }) => {
  await customerFixture(page, { authenticated: true, orders: [{ ...fixtureOrder, total_amount: 1150 }] });
  let status = 'pending';
  let checks = 0;
  await page.route('**/api/payments/**/status', route => { checks++; return route.fulfill({ json: { order_id: 88001, payment_status: status } }); });
  await page.goto('/#/payment-result?order=88001&status=failed');
  await expect(page.getByRole('heading', { name: /^Confirming payment/ })).toBeVisible();
  await expect(page.getByText('Payment was not completed')).toHaveCount(0);
  status = 'paid';
  await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible({ timeout: 15000 });
  expect(checks).toBeGreaterThan(1);
});

for (const width of [390, 430, 768, 1024, 1280, 1440]) {
  test(`staff sidebar and centered accessible sign out at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await staffFixture(page);
    await page.goto('/#/staff/dashboard');
    await expect(page.getByRole('heading', { name: /Today's work/ })).toBeVisible();
    if (width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const sidebar = page.locator('.staff-sidebar').filter({ visible: true });
    await expect(sidebar).toHaveCSS('background-color', 'rgb(9, 11, 15)');
    await expect(sidebar.getByText('Staff portal', { exact: true })).toBeVisible();
    if ([390, 768, 1440].includes(width)) await photo(page, `staff-${width}`);
    const signout = sidebar.getByRole('button', { name: 'Sign out', exact: true });
    await signout.click();
    const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true });
    const box = await dialog.locator('.brand-dialog-panel').boundingBox();
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(3);
    expect(Math.abs(box.y + box.height / 2 - 500)).toBeLessThan(3);
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    if ([390, 768, 1440].includes(width)) await photo(page, `signout-${width}`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(signout).toBeFocused();
    if (width < 1024) await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await noOverflow(page);
  });
}

test('variant and quantity persist through the existing server cart on refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const state = await customerFixture(page, { authenticated: true });
  const variant = { id: 71, option_combination: { Color: 'Black' }, price: 500, stock_quantity: 2 };
  state.product.variants = [variant];
  let submitted;
  await page.route('**/api/cart/add', async route => {
    submitted = route.request().postDataJSON();
    state.cart = [{ id: 77001, product_id: state.product.id, variant_id: submitted.variant_id, variant, quantity: submitted.quantity, product: state.product }];
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/#/products/98001');
  await page.locator('.product-mobile-purchase-bar').getByRole('button', { name: 'Add to cart', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add to cart', exact: true });
  await sheet.getByRole('button', { name: /Black/ }).click();
  await sheet.getByRole('button', { name: 'Increase quantity' }).click();
  await sheet.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(submitted.variant_id).toBe(71);
  expect(submitted.quantity).toBe(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open cart, 2 items', exact: true })).toBeVisible();
  expect(state.cart[0].variant_id).toBe(71);
  expect(state.cart[0].quantity).toBe(2);
});
