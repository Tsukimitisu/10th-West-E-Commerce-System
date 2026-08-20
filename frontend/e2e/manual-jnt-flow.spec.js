import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import pool from '../../backend/src/config/database.js';

const apiUrl = (process.env.E2E_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const customer = {
  email: process.env.E2E_CUSTOMER_EMAIL,
  password: process.env.E2E_CUSTOMER_PASSWORD,
};
const customerAlt = {
  email: process.env.E2E_CUSTOMER_ALT_EMAIL,
  password: process.env.E2E_CUSTOMER_ALT_PASSWORD,
};
const owner = {
  email: process.env.E2E_OWNER_EMAIL,
  password: process.env.E2E_OWNER_PASSWORD,
};

const acceptCookies = async (page) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
};

const login = async (page, account) => {
  await acceptCookies(page);
  await page.goto('/#/login');
  await page.getByPlaceholder('name@example.com').fill(account.email);
  await page.getByPlaceholder('Enter your password').fill(account.password);
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/auth/login') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page).not.toHaveURL(/#\/login/);
};

const getCsrfToken = async (page) => {
  const response = await page.request.get(`${apiUrl}/csrf-token`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.csrfToken).toEqual(expect.any(String));
  return body.csrfToken;
};

const jsonMutation = async (page, method, path, body, csrfToken, headers = {}) => (
  page.request.fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      ...headers,
    },
    data: body,
  })
);

const createTemporaryProduct = async (marker) => {
  const identifier = marker.slice(0, 90);
  const result = await pool.query(
    `INSERT INTO products (
       part_number, name, description, price, buying_price, stock_quantity,
       low_stock_threshold, sku, barcode, status, is_deleted, product_type, weight_kg
     ) VALUES ($1,$2,$3,200,120,3,1,$1,$4,'active',false,'single',2)
     RETURNING id, name`,
    [identifier, `Manual J&T E2E ${marker}`, `Temporary Manual J&T fixture ${marker}`, `${identifier}-bar`]
  );
  const product = result.rows[0];
  await pool.query(
    `INSERT INTO stock_movements (
       product_id, quantity_delta, stock_before, stock_after, reason, reference_type, metadata
     ) VALUES ($1,3,0,3,'initial_stock','e2e',$2::jsonb)`,
    [product.id, JSON.stringify({ marker })]
  );
  return { id: Number(product.id), name: product.name };
};

const cleanupFixtures = async ({ marker, productId, orderId, addressId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (orderId) {
      const orderKeys = await client.query(
        'SELECT checkout_idempotency_key FROM orders WHERE id = $1',
        [orderId]
      );
      await client.query(
        `DELETE FROM notifications
         WHERE reference_type = 'order' AND reference_id = $1`,
        [orderId]
      );
      const entities = await client.query(
        `SELECT 'order'::text AS entity_type, $1::int::text AS entity_id
         UNION ALL SELECT 'payment', id::text FROM payments WHERE order_id = $1::int
         UNION ALL SELECT 'shipment', id::text FROM shipments WHERE order_id = $1::int`,
        [orderId]
      );
      for (const entity of entities.rows) {
        await client.query(
          'DELETE FROM audit_logs WHERE entity_type = $1 AND entity_id = $2',
          [entity.entity_type, entity.entity_id]
        );
      }
      await client.query('DELETE FROM payments WHERE order_id = $1', [orderId]);
      await client.query('DELETE FROM shipments WHERE order_id = $1', [orderId]);
      await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
      const checkoutKeys = orderKeys.rows
        .map((row) => row.checkout_idempotency_key)
        .filter(Boolean);
      if (checkoutKeys.length > 0) {
        await client.query('DELETE FROM idempotency_keys WHERE key = ANY($1::text[])', [checkoutKeys]);
      }
    }
    if (productId) {
      await client.query('DELETE FROM cart_items WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM stock_movements WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM products WHERE id = $1', [productId]);
    }
    if (addressId) {
      await client.query('DELETE FROM addresses WHERE id = $1 AND street LIKE $2', [addressId, `${marker}%`]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

test.describe('live Manual J&T COD flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterAll(async () => {
    await pool.end();
  });

  test('customer checkout, owner waybill, RBAC, duplicates, and customer timeline work end to end', async ({ browser, page }, testInfo) => {
    test.setTimeout(120_000);
    expect(customer.email && customer.password, 'Customer fixture credentials are required.').toBeTruthy();
    expect(customerAlt.email && customerAlt.password, 'Alternate customer fixture credentials are required.').toBeTruthy();
    expect(owner.email && owner.password, 'Owner fixture credentials are required.').toBeTruthy();

    const marker = `jnt-e2e-${testInfo.project.name}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const waybillNumber = `JTWB-${testInfo.project.name}-${Date.now()}`;
    const trackingNumber = `JTTR-${testInfo.project.name}-${Date.now()}`;
    let productId = null;
    let addressId = null;
    let orderId = null;
    let shipmentId = null;
    let ownerContext;
    let alternateContext;

    try {
      const product = await createTemporaryProduct(marker);
      productId = product.id;

      await login(page, customer);
      let customerCsrf = await getCsrfToken(page);
      const clearCartResponse = await jsonMutation(page, 'DELETE', '/cart/clear', {}, customerCsrf);
      expect(clearCartResponse.status()).toBe(200);

      const addressResponse = await jsonMutation(page, 'POST', '/addresses', {
        recipient_name: 'Manual J&T E2E Customer',
        phone: '09171234567',
        street: `${marker} West Avenue`,
        barangay: 'Barangay 1',
        city: 'Manila',
        state: 'Metro Manila',
        postal_code: '1000',
        country: 'Philippines',
        is_default: true,
      }, customerCsrf);
      expect(addressResponse.status()).toBe(201);
      addressId = Number((await addressResponse.json()).address.id);

      const addCartResponse = await jsonMutation(page, 'POST', '/cart/add', {
        product_id: productId,
        quantity: 1,
      }, customerCsrf);
      expect(addCartResponse.status()).toBe(200);

      await page.goto(`/#/products/${productId}`);
      await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
      await page.goto('/#/cart');
      await page.reload();
      await expect(page.getByText(product.name, { exact: true })).toBeVisible();
      await page.locator('input[type="checkbox"]:visible').first().check();

      const quoteResponsePromise = page.waitForResponse((response) => (
        response.url().includes('/api/shipping/quote') && response.request().method() === 'POST'
      ));
      await page.getByRole('button', { name: /proceed to checkout/i }).click();
      const quoteResponse = await quoteResponsePromise;
      expect(quoteResponse.status()).toBe(200);
      const quote = await quoteResponse.json();
      expect(quote).toMatchObject({
        provider: 'internal',
        courier: 'jnt',
        courier_name: 'J&T Express',
        service_type: 'standard',
        coverage: 'luzon_only',
        shipping_zone: 'metro_manila',
        base_shipping_fee: 100,
        weight_surcharge: 50,
        distance_surcharge: 30,
        shipping_fee: 180,
        actual_weight_kg: 2,
        estimated_distance_km: 12,
        distance_class: 'mid',
        package_class: 'medium',
      });
      const shippingSection = page.getByRole('heading', { name: 'Shipping Method' }).locator('..');
      await expect(shippingSection).toContainText(/(?:₱|PHP)\s*180\.00/);
      await expect(shippingSection).toContainText('Shipping Coverage');
      await expect(shippingSection).toContainText('Luzon only');
      await expect(shippingSection).toContainText('Estimated Distance');
      await expect(shippingSection).toContainText('Actual Weight');
      await expect(page.getByRole('button', { name: /Cash on Delivery/ })).toBeVisible();
      await page.getByText(/I agree to the/).locator('..').getByRole('checkbox').check();

      const checkoutResponsePromise = page.waitForResponse((response) => (
        response.url().endsWith('/api/orders') && response.request().method() === 'POST'
      ));
      await page.getByRole('button', { name: /place cod order/i }).click();
      const checkoutResponse = await checkoutResponsePromise;
      expect(checkoutResponse.status()).toBe(201);
      const checkout = await checkoutResponse.json();
      orderId = Number(checkout.order_id);
      expect(checkout.totals.shipping_fee).toBe(180);
      expect(checkout.totals.total).toBe(
        checkout.totals.subtotal + checkout.totals.shipping_fee + checkout.totals.tax - checkout.totals.discount
      );
      expect(checkout.shipping).toMatchObject({ provider: 'internal', courier: 'jnt', service_type: 'standard' });
      await expect(page).toHaveURL(new RegExp(`#\/order-confirmation\/${orderId}$`));

      const persistedCheckoutResponse = await page.request.get(`${apiUrl}/checkout/${orderId}`);
      expect(persistedCheckoutResponse.status()).toBe(200);
      const persistedCheckout = await persistedCheckoutResponse.json();
      expect(Number(persistedCheckout.totals.shipping_fee)).toBe(180);
      expect(Number(persistedCheckout.payment.amount)).toBe(Number(persistedCheckout.totals.total));
      expect(persistedCheckout.shipping).toMatchObject({
        shipping_zone: 'metro_manila',
        actual_weight_kg: 2,
        estimated_distance_km: 12,
        distance_surcharge: 30,
      });

      customerCsrf = await getCsrfToken(page);
      const customerWaybillResponse = await jsonMutation(page, 'POST', `/shipments/orders/${orderId}/waybill`, {
        waybill_number: `${waybillNumber}-CUSTOMER`,
        tracking_number: `${trackingNumber}-CUSTOMER`,
        service_type: 'standard',
      }, customerCsrf);
      expect(customerWaybillResponse.status()).toBe(403);

      ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await login(ownerPage, owner);
      const ownerCsrf = await getCsrfToken(ownerPage);
      const processingResponse = await jsonMutation(ownerPage, 'PATCH', `/orders/${orderId}/status`, {
        status: 'processing',
        note: marker,
      }, ownerCsrf);
      expect(processingResponse.status()).toBe(200);

      await ownerPage.goto('/#/admin/orders');
      await ownerPage.getByPlaceholder('Search orders...').fill(String(orderId));
      const orderLabel = `#${String(orderId).padStart(4, '0')}`;
      const orderRow = ownerPage.locator('tr').filter({ hasText: orderLabel });
      await expect(orderRow).toBeVisible();
      await orderRow.getByTitle('View').click();
      await expect(ownerPage.getByRole('button', { name: 'Create J&T Waybill' })).toBeVisible();
      await ownerPage.getByRole('button', { name: 'Create J&T Waybill' }).click();
      await ownerPage.getByPlaceholder('JT123456789').nth(0).fill(waybillNumber);
      await ownerPage.getByPlaceholder('JT123456789').nth(1).fill(trackingNumber);
      const waybillResponsePromise = ownerPage.waitForResponse((response) => (
        response.url().endsWith(`/api/shipments/orders/${orderId}/waybill`)
        && response.request().method() === 'POST'
      ));
      await ownerPage.getByRole('button', { name: 'Save Waybill' }).click();
      const waybillResponse = await waybillResponsePromise;
      expect(waybillResponse.status()).toBe(201);
      const waybill = await waybillResponse.json();
      shipmentId = Number(waybill.shipment.id);
      await expect(ownerPage.getByText(trackingNumber, { exact: true })).toBeVisible();

      const cancelledResponse = await jsonMutation(ownerPage, 'PATCH', `/shipments/${shipmentId}/status`, {
        status: 'cancelled',
        description: marker,
      }, ownerCsrf);
      expect(cancelledResponse.status()).toBe(200);
      const duplicateWaybillResponse = await jsonMutation(ownerPage, 'POST', `/shipments/orders/${orderId}/waybill`, {
        waybill_number: waybillNumber,
        tracking_number: `${trackingNumber}-NEW`,
        service_type: 'standard',
      }, ownerCsrf);
      expect(duplicateWaybillResponse.status()).toBe(409);
      expect((await duplicateWaybillResponse.json()).code).toBe('DUPLICATE_WAYBILL_NUMBER');
      const duplicateTrackingResponse = await jsonMutation(ownerPage, 'POST', `/shipments/orders/${orderId}/waybill`, {
        waybill_number: `${waybillNumber}-NEW`,
        tracking_number: trackingNumber,
        service_type: 'standard',
      }, ownerCsrf);
      expect(duplicateTrackingResponse.status()).toBe(409);
      expect((await duplicateTrackingResponse.json()).code).toBe('DUPLICATE_TRACKING_NUMBER');

      for (const status of ['picked_up', 'in_transit', 'out_for_delivery', 'delivered']) {
        const statusResponse = await jsonMutation(ownerPage, 'PATCH', `/shipments/${shipmentId}/status`, {
          status,
          description: `${marker} ${status}`,
          location: status === 'delivered' ? 'Test delivery point' : 'J&T test hub',
        }, ownerCsrf);
        expect(statusResponse.status()).toBe(200);
      }
      const duplicateActiveResponse = await jsonMutation(ownerPage, 'POST', `/shipments/orders/${orderId}/waybill`, {
        waybill_number: `${waybillNumber}-ACTIVE`,
        tracking_number: `${trackingNumber}-ACTIVE`,
        service_type: 'standard',
      }, ownerCsrf);
      expect(duplicateActiveResponse.status()).toBe(409);
      expect((await duplicateActiveResponse.json()).code).toBe('ACTIVE_SHIPMENT_EXISTS');

      alternateContext = await browser.newContext();
      const alternatePage = await alternateContext.newPage();
      await login(alternatePage, customerAlt);
      const otherCustomerShipment = await alternatePage.request.get(`${apiUrl}/shipments/orders/${orderId}`);
      expect(otherCustomerShipment.status()).toBe(404);

      const ownShipmentResponse = await page.request.get(`${apiUrl}/shipments/orders/${orderId}`);
      expect(ownShipmentResponse.status()).toBe(200);
      const ownShipment = await ownShipmentResponse.json();
      expect(ownShipment.shipment).toMatchObject({
        waybill_number: waybillNumber,
        tracking_number: trackingNumber,
        status: 'delivered',
      });
      expect(ownShipment.shipment).not.toHaveProperty('created_by');
      expect(ownShipment.shipment).not.toHaveProperty('notes');
      expect(ownShipment.events.map((event) => event.status)).toEqual(expect.arrayContaining([
        'waybill_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered',
      ]));
      const deliveredOrderResponse = await page.request.get(`${apiUrl}/orders/${orderId}`);
      expect(deliveredOrderResponse.status()).toBe(200);
      expect((await deliveredOrderResponse.json()).shipping_status).toBe('delivered');

      await page.goto(`/#/orders/${orderId}`);
      await expect(page.getByText('Shipping Calculation', { exact: true })).toBeVisible();
      await expect(page.getByText('Luzon only', { exact: true })).toBeVisible();
      await expect(page.getByText(waybillNumber, { exact: true })).toBeVisible();
      await expect(page.getByText(trackingNumber, { exact: true })).toBeVisible();
      await expect(page.getByText(/Tracking updates are manually encoded by the store/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create J&T Waybill' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Update Shipment Status' })).toHaveCount(0);
    } finally {
      await alternateContext?.close().catch(() => {});
      await ownerContext?.close().catch(() => {});
      await cleanupFixtures({ marker, productId, orderId, addressId });
    }
  });
});
