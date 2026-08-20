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
    coverage: 'luzon_only',
    shipping_zone: 'metro_manila',
    estimated_distance_km: 25,
    distance_class: 'mid',
    far_delivery: false,
    shipping_fee: 100,
    currency: 'PHP',
    free_shipping_applied: false,
    estimated_delivery_days: '3-7 days',
  });
});

test('Luzon and known Luzon-region addresses use configured fees', () => {
  const luzon = calculateInternalShippingQuote({
    subtotal: 500,
    address: { state: 'Bulacan', city: 'Malolos' },
    environment,
  });
  const fallback = calculateInternalShippingQuote({
    subtotal: 500,
    address: { region: 'Central Luzon', state: 'Unlisted Province', city: 'Unlisted Place' },
    environment,
  });
  assert.equal(luzon.shipping_fee, 150);
  assert.equal(fallback.shipping_fee, 120);
});

test('outside-Luzon and unclear addresses are blocked', () => {
  assert.throws(
    () => calculateInternalShippingQuote({ subtotal: 500, address: { state: 'Cebu' }, environment }),
    (error) => error.code === 'SHIPPING_NOT_AVAILABLE'
  );
  assert.throws(
    () => calculateInternalShippingQuote({ subtotal: 500, address: {}, environment }),
    (error) => error.code === 'SHIPPING_ADDRESS_UNCLEAR'
  );
});

test('free shipping threshold overrides every destination fee', () => {
  const quote = calculateInternalShippingQuote({
    subtotal: 3000,
    address: { state: 'Bulacan' },
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
