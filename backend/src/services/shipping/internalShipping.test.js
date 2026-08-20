import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDatabaseShippingQuote,
  calculateInternalShippingQuote,
} from './internalShipping.js';

const environment = {
  METRO_MANILA_SHIPPING_FEE: '100',
  PROVINCIAL_SHIPPING_FEE: '150',
  DEFAULT_SHIPPING_FEE: '120',
  FREE_SHIPPING_THRESHOLD: '3000',
  COURIER_PROVIDER: 'jnt',
  JNT_COURIER_NAME: 'J&T Express',
  JNT_DEFAULT_SERVICE: 'standard',
};

test('Metro Manila quote uses the internal J&T metro fee', () => {
  assert.deepEqual(calculateInternalShippingQuote({
    subtotal: 2500,
    address: { state: 'National Capital Region', city: 'Makati' },
    environment,
  }), {
    provider: 'internal',
    courier: 'jnt',
    courier_name: 'J&T Express',
    service_type: 'standard',
    shipping_fee: 100,
    currency: 'PHP',
    free_shipping_applied: false,
    estimated_delivery_days: '3-7 days',
  });
});

test('provincial and unclassified addresses use their configured fallback fees', () => {
  const provincial = calculateInternalShippingQuote({
    subtotal: 500,
    address: { state: 'Cebu', city: 'Cebu City' },
    environment,
  });
  const fallback = calculateInternalShippingQuote({ subtotal: 500, address: {}, environment });
  assert.equal(provincial.shipping_fee, 150);
  assert.equal(fallback.shipping_fee, 120);
});

test('free shipping threshold overrides every destination fee', () => {
  const quote = calculateInternalShippingQuote({
    subtotal: 3000,
    address: { state: 'Cebu' },
    environment,
  });
  assert.equal(quote.shipping_fee, 0);
  assert.equal(quote.free_shipping_applied, true);
});

test('database quote validates address ownership and ignores frontend prices and totals', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM addresses')) {
        return { rows: [{ id: 10, user_id: 7, state: 'NCR', city: 'Quezon City' }] };
      }
      if (sql.includes('FROM products p')) {
        return { rows: [{
          id: 1, name: 'Helmet', price: '1250.00', sale_price: null,
          is_on_sale: false, status: 'active', is_deleted: false, has_variants: false,
        }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const quote = await calculateDatabaseShippingQuote(db, {
    userId: 7,
    addressId: 10,
    items: [{ product_id: 1, quantity: 2, price: 1, subtotal: 2, shipping_fee: 0 }],
  });
  assert.equal(quote.shipping_fee, 100);
  assert.deepEqual(calls[0].params, [10, 7]);

  await assert.rejects(
    () => calculateDatabaseShippingQuote({ query: async () => ({ rows: [] }) }, {
      userId: 8, addressId: 10, items: [{ product_id: 1, quantity: 1 }],
    }),
    (error) => error.status === 404 && /address/i.test(error.message)
  );
});
