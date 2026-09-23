import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLuzonShippingAvailable,
  classifyPhilippineShippingZone,
  SHIPPING_ZONES,
} from './shippingLocation.js';

test('classifies NCR city and region aliases as Metro Manila', () => {
  for (const address of [
    { state: 'NCR', city: 'Unknown City' },
    { state: 'National Capital Region', city: 'Makati' },
    { city: 'Las Piñas' },
    { address_string: 'Barangay Potrero, Malabon, Metro Manila' },
  ]) {
    assert.equal(classifyPhilippineShippingZone(address), SHIPPING_ZONES.METRO_MANILA);
  }
});

test('classifies common Luzon provinces and cities', () => {
  for (const address of [
    { state: 'Bulacan', city: 'Malolos' },
    { province: 'Camarines Sur', city: 'Naga' },
    { city: 'Baguio' },
    { province: 'Palawan' },
  ]) {
    assert.equal(classifyPhilippineShippingZone(address), SHIPPING_ZONES.LUZON);
  }
});

test('classifies Visayas and Mindanao before similarly named Luzon places', () => {
  for (const address of [
    { province: 'Cebu', city: 'Cebu City' },
    { province: 'Davao del Sur', city: 'Davao City' },
    { region: 'Northern Mindanao', city: 'Cagayan de Oro' },
    { region: 'Eastern Visayas', city: 'Tacloban' },
  ]) {
    assert.equal(classifyPhilippineShippingZone(address), SHIPPING_ZONES.OUTSIDE_LUZON);
  }
});

test('distinguishes unknown Luzon region from an unclear address', () => {
  assert.equal(
    classifyPhilippineShippingZone({ region: 'Central Luzon', city: 'Unlisted Place' }),
    SHIPPING_ZONES.UNKNOWN_LUZON
  );
  assert.equal(
    classifyPhilippineShippingZone({ state: 'Unlisted Province', city: 'Unlisted Place' }),
    SHIPPING_ZONES.UNKNOWN
  );
});

test('Luzon availability rejects outside and unclear locations with safe codes', () => {
  assert.throws(
    () => assertLuzonShippingAvailable(SHIPPING_ZONES.OUTSIDE_LUZON),
    (error) => error.status === 422 && error.code === 'SHIPPING_NOT_AVAILABLE'
  );
  assert.throws(
    () => assertLuzonShippingAvailable(SHIPPING_ZONES.UNKNOWN),
    (error) => error.status === 422 && error.code === 'SHIPPING_ADDRESS_UNCLEAR'
  );
  assert.equal(assertLuzonShippingAvailable(SHIPPING_ZONES.UNKNOWN_LUZON), 'unknown_luzon');
});
