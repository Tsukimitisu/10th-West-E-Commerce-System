import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import { getAuthAvailability } from '../routes/auth.js';
import { __testing as orderTesting } from './orderController.js';

after(async () => {
  await pool.end().catch(() => {});
});

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const withoutProviderEnvironment = (callback) => {
  const keys = [
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
    'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => { delete process.env[key]; });
  try {
    return callback();
  } finally {
    keys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  }
};

test('unconfigured OAuth and GCash readiness is explicit while real TOTP remains available', () => {
  const readiness = withoutProviderEnvironment(() => getAuthAvailability());
  assert.equal(readiness.google.available, false);
  assert.equal(readiness.google.reason, 'missing_google_oauth_config');
  assert.equal(readiness.google.client_id_present, false);
  assert.equal(readiness.google.client_secret_present, false);
  assert.equal(readiness.google.callback_url_present, true);
  assert.deepEqual(readiness.facebook, { available: false, reason: 'not_configured' });
  assert.deepEqual(readiness.gcash, { available: false, reason: 'not_configured' });
  assert.deepEqual(readiness.two_factor, { available: true, reason: null, method: 'totp' });
  assert.deepEqual(readiness.phone_verification, {
    available: false,
    status: 'unavailable',
    reason: 'not_configured',
  });
});

test('staff order customer display uses safe priority fallbacks and never undefined', () => {
  assert.equal(orderTesting.resolveCustomerDisplayName({ customer_name: 'Rider One' }, {}), 'Rider One');
  assert.equal(orderTesting.resolveCustomerDisplayName({}, { recipient_name: 'Recipient Two' }), 'Recipient Two');
  assert.equal(orderTesting.resolveCustomerDisplayName({ customer_email: 'rider@example.test' }, {}), 'rider@example.test');
  assert.equal(orderTesting.resolveCustomerDisplayName({ user_id: null, guest_email: 'guest@example.test' }, {}), 'guest@example.test');
  assert.equal(orderTesting.resolveCustomerDisplayName({}, {}), 'Customer unavailable');
});

test('staff order items serialize name, image, quantity, unit price, and line total', () => {
  assert.deepEqual(orderTesting.mapOrderItemRecord({
    product_name: 'Helmet',
    image_snapshot: '/uploads/helmet.webp',
    quantity: 3,
    product_price: '450.25',
  }), {
    product_name: 'Helmet',
    image_snapshot: '/uploads/helmet.webp',
    quantity: 3,
    product_price: 450.25,
    name: 'Helmet',
    image_url: '/uploads/helmet.webp',
    price: 450.25,
    unit_price: 450.25,
    line_total: 1350.75,
  });
});

test('free-shipping defaults and public configuration stay aligned without the old 2500 value', async () => {
  const [orders, shipping, api] = await Promise.all([
    read('./orderController.js'),
    read('../services/shipping/internalShipping.js'),
    read('../routes/shipping.js'),
  ]);
  assert.match(orders, /FREE_SHIPPING_THRESHOLD \|\| '3000'/);
  assert.doesNotMatch(orders, /FREE_STANDARD_SHIPPING_THRESHOLD = 2500/);
  assert.match(shipping, /FREE_SHIPPING_THRESHOLD/);
  assert.match(api, /free_shipping_threshold/);
});

test('review eligibility and creation both require delivered or completed purchases', async () => {
  const [controller, routes] = await Promise.all([
    read('./reviewController.js'),
    read('../routes/reviews.js'),
  ]);
  const deliveredChecks = controller.match(/o\.status IN \('delivered', 'completed'\)/g) || [];
  assert.ok(deliveredChecks.length >= 3);
  assert.match(controller, /You can review this item after it is delivered\./);
  assert.match(routes, /\/eligibility\/:productId', authenticateToken/);
});

test('customer directory API excludes store staff and returns a restricted field set', async () => {
  const adminRoutes = await read('../routes/admin.js');
  const customerRoute = adminRoutes.slice(adminRoutes.indexOf("router.get(\n  '/customers'"), adminRoutes.indexOf('// All admin/system routes'));
  assert.match(customerRoute, /requireRole\('super_admin', 'owner', 'admin'\)/);
  assert.match(customerRoute, /requirePermission\('customers\.view'\)/);
  assert.match(customerRoute, /SELECT id, name, email, phone, is_active, created_at/);
  assert.doesNotMatch(customerRoute, /password|two_factor_secret|reset_token/);
});

test('checkout cart deletion remains COD-only and occurs after order creation', async () => {
  const checkout = await read('./secureCheckoutController.js');
  const insertIndex = checkout.indexOf('INSERT INTO orders');
  const clearIndex = checkout.indexOf('await clearPurchasedCartItems');
  const commitIndex = checkout.indexOf("await client.query('COMMIT')", clearIndex);
  assert.match(checkout, /paymentMethod === 'cod' && purchaseSource === 'cart'/);
  assert.ok(insertIndex > -1 && clearIndex > insertIndex && commitIndex > clearIndex);
  assert.match(checkout, /purchase_source: purchaseSource/);
});

test('barcode behavior is lookup/search only and backend POS search includes barcode', async () => {
  const [products, pos, migration] = await Promise.all([
    read('./productController.js'),
    read('./posController.js'),
    read('../../migrations/202608290001_stock_adjustment_reason_rules.cjs'),
  ]);
  assert.match(products, /cleanBarcode = sanitizePlainText\(barcode/);
  assert.match(pos, /p\.barcode ILIKE \$1/);
  assert.match(migration, /correction_add/);
  assert.match(migration, /correction_remove/);
});

test('COD, Manual J&T, and Luzon-only shipping remain wired into checkout', async () => {
  const [checkout, jnt, shipping, shippingLocation] = await Promise.all([
    read('./secureCheckoutController.js'),
    read('./manualJntCheckout.test.js'),
    read('../services/shipping/internalShipping.js'),
    read('../services/shipping/shippingLocation.js'),
  ]);
  assert.match(checkout, /paymentMethod === 'cod'/);
  assert.match(jnt, /manual J&T/i);
  assert.match(shipping, /luzon_only/);
  assert.match(shippingLocation, /outside_luzon/);
});
