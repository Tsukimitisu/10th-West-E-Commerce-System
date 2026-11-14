import { expect, test } from '@playwright/test';

test('four-to-six digit cart prices never overlap quantity controls at responsive widths', async ({ page }) => {
  const productId = 987654;
  await page.route('**/api/auth/profile/optional', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 700001, name: 'Layout Test Rider', email: 'layout@example.test', role: 'customer' }),
  }));
  await page.route('**/api/notifications/unread-count', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ count: 0 }),
  }));
  await page.route('**/api/notifications', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/api/announcements', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.route('**/api/chats/my-conversations**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ conversations: [] }),
  }));
  await page.route('**/api/cart**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            id: 12345,
            product_id: productId,
            quantity: 50,
            product: {
              id: productId,
              name: 'Responsive Layout Test Product',
              price: 100000,
              is_on_sale: false,
              stock_quantity: 100,
              image: '',
            },
          }],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/#/cart');
  const row = page.getByTestId(`cart-row-${productId}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('100,000.00');

  for (const width of [768, 769, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const price = await row.getByTestId('cart-unit-price').boundingBox();
    const quantity = await row.getByTestId('cart-quantity').boundingBox();
    const total = await row.getByTestId('cart-line-total').boundingBox();
    expect(price, `unit price should be rendered at ${width}px`).not.toBeNull();
    expect(quantity, `quantity should be rendered at ${width}px`).not.toBeNull();
    expect(total, `line total should be rendered at ${width}px`).not.toBeNull();
    expect(price.x + price.width, `price must end before quantity at ${width}px`).toBeLessThanOrEqual(quantity.x);
    expect(quantity.x + quantity.width, `quantity must end before total at ${width}px`).toBeLessThanOrEqual(total.x);
  }
});
