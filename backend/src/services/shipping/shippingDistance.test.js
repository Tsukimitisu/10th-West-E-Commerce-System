import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateDeliveryDistance } from './shippingDistance.js';

test('uses customer city before province', () => {
  const result = estimateDeliveryDistance({
    address: { city: 'Quezon City', province: 'Metro Manila' },
    shippingZone: 'metro_manila',
  });
  assert.equal(result.estimated_distance_km, 15);
  assert.equal(result.distance_source, 'city');
  assert.equal(result.distance_class, 'mid');
});

test('falls back to the customer province', () => {
  const result = estimateDeliveryDistance({
    address: { city: 'Malolos', province: 'Bulacan' },
    shippingZone: 'luzon',
  });
  assert.equal(result.estimated_distance_km, 35);
  assert.equal(result.distance_source, 'province');
});

test('uses safe zone defaults for unmatched classified places', () => {
  assert.equal(estimateDeliveryDistance({
    address: { city: 'Unlisted NCR City' },
    shippingZone: 'metro_manila',
  }).estimated_distance_km, 20);
  assert.equal(estimateDeliveryDistance({
    address: { city: 'Unlisted Luzon City' },
    shippingZone: 'unknown_luzon',
  }).estimated_distance_km, 150);
});

test('far Luzon remains allowed and is marked far_delivery over configured maximum', () => {
  const result = estimateDeliveryDistance({
    address: { province: 'Palawan' },
    shippingZone: 'luzon',
    environment: { MAX_LUZON_DELIVERY_DISTANCE_KM: '300' },
  });
  assert.equal(result.estimated_distance_km, 600);
  assert.equal(result.distance_class, 'very_far');
  assert.equal(result.far_delivery, true);
});

test('does not estimate outside Luzon', () => {
  assert.throws(
    () => estimateDeliveryDistance({ address: { city: 'Cebu City' }, shippingZone: 'outside_luzon' }),
    (error) => error.code === 'SHIPPING_NOT_AVAILABLE'
  );
});
