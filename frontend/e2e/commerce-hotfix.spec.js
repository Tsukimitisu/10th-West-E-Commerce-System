import { expect, test } from '@playwright/test';
import { customerFixture, fixtureOrder, fixtureCart } from './customerPhaseFixture.js';
import { staffFixture, staffPermissions } from './staffPhaseFixture.js';
import { renderOrderInvoice } from '../../backend/src/services/orderInvoice.js';

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const order = { ...fixtureOrder, total_amount: 1150, tax_amount: 0 };
const remaining = { ...fixtureCart(1)[0], id: 77002, product_id: 98002 };
for (const width of [390, 1440]) {
  test(`COD tracking and account navigation at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await customerFixture(page, { authenticated: true, orders: [{ ...order, payment_method: 'cod', payment_status: 'pending', status: 'shipped' }] });
    await page.goto('/#/orders/88001');
    await expect(page.getByText('Payment: Payment Pending', { exact: true })).toBeVisible();
    const progress = page.getByRole('region', { name: 'Order progress' });
    await expect(progress).not.toContainText('Paid'); await expect(progress).toContainText('Out for Delivery');
    await noOverflow(page);
    await page.screenshot({ path: `test-results/hotfix-cod-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const menu = page.getByRole('navigation', { name: 'Store navigation', exact: true });
      for (const label of ['Returns', 'Wishlist']) {
        await expect(menu.getByRole('link', { name: label, exact: true })).toBeVisible();
        expect((await menu.getByRole('link', { name: label, exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: 'test-results/hotfix-mobile-menu.png', fullPage: true });
      await menu.getByRole('link', { name: 'Returns', exact: true }).click();
      await expect(page).toHaveURL(/#\/my-returns$/); await expect(menu).toHaveCount(0);
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await expect(menu.getByRole('link', { name: 'Returns', exact: true })).toHaveAttribute('aria-current', 'page');
      await menu.getByRole('link', { name: 'Wishlist', exact: true }).click();
      await expect(page).toHaveURL(/#\/wishlist$/); await expect(menu).toHaveCount(0);
    }
  });
  test(`paid GCash refreshes cart badge and preserves unrelated additions at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await customerFixture(page, { authenticated: true, orders: [order], cart: [...fixtureCart(2), remaining] });
    await page.route('**/api/payments/orders/88001/status', route => {
      state.cart = state.cart.filter(row => row.id !== 77001);
      return route.fulfill({ json: { order_id: 88001, payment_status: 'paid', payment_method: 'gcash' } });
    });
    await page.goto('/#/payment-result?order=88001&status=success');
    await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open cart, 1 items' })).toBeVisible();
    expect(state.cart.map(row => row.id)).toEqual([77002]);
    await noOverflow(page); await page.screenshot({ path: `test-results/hotfix-confirmation-${width}.png`, fullPage: true });
    await page.reload(); await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open cart, 1 items' })).toBeVisible();
  });
  test(`invoice preview, A4 print and Staff POS header at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await staffFixture(page, { permissions: [...staffPermissions, 'pos.access'] });
    await page.goto('/#/pos');
    const header = page.locator('.pos-header'); await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', 'rgb(9, 11, 15)');
    await noOverflow(page); await page.screenshot({ path: `test-results/hotfix-staff-pos-${width}.png`, fullPage: true });
    const origin = new URL(page.url()).origin;
    const { html } = renderOrderInvoice({ order, items: order.items.map(item => ({ ...item, product_name: item.name, product_price: item.price, part_number: 'BRK-H125-042' })),
      store: { name: '10th West Moto', address: 'Configured business address', phone: '09171234567', email: 'shop@example.test' }, shipping: order.shipping_address_snapshot,
      address: 'Sample Street, Quezon City, Metro Manila 1100', totals: { subtotal: 1000, discount: 0, shippingFee: 150, tax: 0, totalAmount: 1150 },
      taxName: 'Tax', legalLines: [], origin, escape: value => String(value ?? '') });
    await page.route('**/hotfix-invoice', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${origin}/hotfix-invoice`);
    await expect(page.getByRole('heading', { name: 'INVOICE', exact: true })).toBeVisible();
    await expect(page.getByText('BILL TO', { exact: true })).toBeVisible(); await expect(page.getByText('SHIP TO', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Invoice totals' })).toContainText('1,150'.replace(',', ''));
    await expect(page.locator('body')).not.toContainText('VAT Inclusive');
    await noOverflow(page); await page.screenshot({ path: `test-results/hotfix-invoice-${width}.png`, fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Print Invoice' })).toBeHidden();
    expect(await page.evaluate(() => [...document.styleSheets[0].cssRules].some(rule => rule.cssText.includes('size: a4')))).toBe(true);
  });
}
for (const phase of ['pending','failed','cancelled','unknown']) test(`${phase} GCash preserves the cart despite a success redirect query`, async ({ page }) => {
  const state = await customerFixture(page, { authenticated: true, cart: fixtureCart(2) });
  await page.route('**/api/payments/orders/88001/status', route => route.fulfill({ json: { order_id: 88001, payment_status: phase } }));
  await page.goto('/#/payment-result?order=88001&status=success');
  await expect(page.getByRole('heading', { name: phase === 'failed' ? 'Payment was not completed' : phase === 'cancelled' ? 'Payment cancelled' : 'Confirming payment...' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open cart, 2 items' })).toBeVisible();
  expect(state.cart).toHaveLength(1); expect(state.cart[0].quantity).toBe(2);
});
