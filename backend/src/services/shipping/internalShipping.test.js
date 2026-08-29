import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDistanceSurcharge,
  calculateDatabaseShippingQuote,
  calculateInternalShippingQuote,
  calculateWeightSurcharge,
} from './internalShipping.js';

const environment = {
  METRO_MANILA_SHIPPING_FEE: '100',
  LUZON_SHIPPING_FEE: '150',
  DEFAULT_SHIPPING_FEE: '120',
  FREE_SHIPPING_THRESHOLD: '3000',
  SMALL_PACKAGE_MAX_KG: '1',
  MEDIUM_PACKAGE_MAX_KG: '3',
  LARGE_PACKAGE_MAX_KG: '5',
  MEDIUM_PACKAGE_SURCHARGE: '50',
  LARGE_PACKAGE_SURCHARGE: '100',
  OVERSIZED_PACKAGE_SURCHARGE: '150',
  NEAR_DISTANCE_SURCHARGE: '0',
  MID_DISTANCE_SURCHARGE: '30',
  FAR_DISTANCE_SURCHARGE: '80',
  VERY_FAR_DISTANCE_SURCHARGE: '120',
  COURIER_PROVIDER: 'jnt',
  JNT_COURIER_NAME: 'J&T Express',
  JNT_DEFAULT_SERVICE: 'standard',
};

test('Metro Manila quote uses the internal J&T metro fee', () => {
  assert.deepEqual(calculateInternalShippingQuote({
    subtotal: 2500,
    actualWeightKg: 2,
    address: { state: 'National Capital Region', city: 'Makati' },
    environment,
  }), {
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
    currency: 'PHP',
    actual_weight_kg: 2,
    estimated_distance_km: 25,
    distance_class: 'mid',
    package_class: 'medium',
    far_delivery: false,
    free_shipping_applied: false,
    free_shipping_threshold: 3000,
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
  assert.equal(luzon.base_shipping_fee, 150);
  assert.equal(luzon.shipping_fee, 180);
  assert.equal(fallback.base_shipping_fee, 120);
  assert.equal(fallback.shipping_fee, 200);
});

test('weight surcharge covers small, medium, large, and oversized actual packages', () => {
  assert.deepEqual(calculateWeightSurcharge(1, environment), { packageClass: 'small', surcharge: 0 });
  assert.deepEqual(calculateWeightSurcharge(2, environment), { packageClass: 'medium', surcharge: 50 });
  assert.deepEqual(calculateWeightSurcharge(4, environment), { packageClass: 'large', surcharge: 100 });
  assert.deepEqual(calculateWeightSurcharge(6, environment), { packageClass: 'oversized', surcharge: 150 });
});

test('distance surcharge covers near, mid, far, and very far tiers', () => {
  assert.equal(calculateDistanceSurcharge({ distance_class: 'near', estimated_distance_km: 5 }, environment), 0);
  assert.equal(calculateDistanceSurcharge({ distance_class: 'mid', estimated_distance_km: 25 }, environment), 30);
  assert.equal(calculateDistanceSurcharge({ distance_class: 'far', estimated_distance_km: 100 }, environment), 80);
  assert.equal(calculateDistanceSurcharge({ distance_class: 'very_far', estimated_distance_km: 350 }, environment), 120);
});

test('rate-per-km mode is available while tier mode remains the default', () => {
  assert.equal(calculateDistanceSurcharge(
    { distance_class: 'mid', estimated_distance_km: 12.5 },
    { ...environment, DISTANCE_SURCHARGE_MODE: 'rate_per_km', DISTANCE_FREE_KM: '5', DISTANCE_RATE_PER_KM: '5' }
  ), 38);
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
  assert.ok(quote.base_shipping_fee > 0);
  assert.ok(quote.distance_surcharge > 0);
});

test('database quote validates address ownership and ignores frontend prices and totals', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM addresses')) {
        return { rows: [{
          id: 10, user_id: 7, recipient_name: 'Test Rider', phone: '09171234567',
          street: '1 Main Street', barangay: 'Bagumbayan', state: 'NCR', city: 'Quezon City',
          postal_code: '1110', country: 'Philippines', lat: null, lng: null,
        }] };
      }
      if (sql.includes('FROM products p')) {
        return { rows: [{
          id: 1, name: 'Helmet', price: '1250.00', sale_price: null,
          weight_kg: '1.25', is_on_sale: false, status: 'active', is_deleted: false, has_variants: false,
        }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const quote = await calculateDatabaseShippingQuote(db, {
    userId: 7,
    addressId: 10,
    items: [{ product_id: 1, quantity: 2, price: 1, subtotal: 2, shipping_fee: 0, weight_kg: 0.01 }],
  });
  assert.equal(quote.shipping_fee, 180);
  assert.equal(quote.actual_weight_kg, 2.5);
  assert.match(calls.find((call) => call.sql.includes('FROM products p')).sql, /p\.weight_kg/);
  assert.deepEqual(calls[0].params, [10, 7]);

  await assert.rejects(
    () => calculateDatabaseShippingQuote({ query: async () => ({ rows: [] }) }, {
      userId: 8, addressId: 10, items: [{ product_id: 1, quantity: 1 }],
    }),
    (error) => error.status === 404 && /address/i.test(error.message)
  );
});

test('database quote accepts a complete new unsaved checkout address', async () => {
  const db = {
    async query(sql) {
      if (String(sql).includes('FROM products p')) {
        return { rows: [{
          id: 1, name: 'Helmet', price: '1250.00', sale_price: null,
          weight_kg: '1', is_on_sale: false, status: 'active', is_deleted: false, has_variants: false,
        }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const quote = await calculateDatabaseShippingQuote(db, {
    userId: 7,
    address: {
      recipient_name: 'Test Rider', phone: '09171234567', street: '1 Main Street',
      barangay: 'Bagumbayan', city: 'Quezon City', state: 'Metro Manila (NCR)',
      postal_code: '1110', country: 'Philippines',
    },
    items: [{ product_id: 1, quantity: 1 }],
    validateAddressLocation: false,
  });
  assert.equal(quote.shipping_zone, 'metro_manila');
  assert.equal(quote.actual_weight_kg, 1);
});
