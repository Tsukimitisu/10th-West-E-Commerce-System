import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('checkout shows the complete Luzon actual-weight distance shipping breakdown', async () => {
  const source = await read('pages/customer/Checkout.jsx');
  for (const label of [
    'Shipping Coverage', 'Courier', 'Shipping Zone', 'Estimated Distance', 'Actual Weight',
    'Base Shipping Fee', 'Weight Surcharge', 'Distance Surcharge', 'Final Shipping Fee',
    'Free Shipping Applied',
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Luzon only/);
  assert.match(source, /shippingQuote\.estimated_distance_km/);
  assert.match(source, /shippingQuote\.actual_weight_kg/);
});

test('checkout blocks non-Luzon and unclear shipping errors', async () => {
  const source = await read('pages/customer/Checkout.jsx');
  assert.match(source, /SHIPPING_NOT_AVAILABLE/);
  assert.match(source, /Shipping is currently available within Luzon only\./);
  assert.match(source, /SHIPPING_ADDRESS_UNCLEAR/);
  assert.match(source, /Please update your shipping address with a valid Luzon city or province\./);
  assert.match(source, /shippingBlocked/);
  assert.match(source, /disabled=\{[^}]*shippingBlocked/);
});

test('order detail shows the persisted shipping calculation', async () => {
  const [source, api] = await Promise.all([
    read('pages/customer/OrderDetail.jsx'),
    read('services/api.js'),
  ]);
  assert.match(source, /Shipping Calculation/);
  assert.match(source, /order\.shipping_zone/);
  assert.match(source, /order\.estimated_distance_km/);
  assert.match(source, /order\.actual_weight_kg/);
  assert.match(api, /base_shipping_fee:/);
  assert.match(api, /distance_surcharge:/);
});

test('checkout does not claim live courier tracking', async () => {
  const source = await read('pages/customer/Checkout.jsx');
  assert.doesNotMatch(source, /live (?:courier )?tracking/i);
  assert.match(source, /Manual J&T waybill/);
});
