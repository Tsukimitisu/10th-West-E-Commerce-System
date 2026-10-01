import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('checkout computes shipping and total on the backend and saves manual J&T fields', async () => {
  const source = await readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8');
  const checkout = source.slice(source.indexOf('export const createCheckout'), source.indexOf('const extractPaymongoEvent'));
  assert.match(checkout, /calculateInternalShippingQuote\(\{ subtotal, actualWeightKg, address \}\)/);
  assert.match(checkout, /item\.weight_kg \* item\.quantity/);
  assert.match(checkout, /const total = roundMoney\(subtotal - discount \+ shippingFee \+ taxAmount\)/);
  assert.match(checkout, /shipping_fee, shipping_provider, courier,/);
  assert.match(checkout, /courier_name, shipping_status, delivery_method/);
  assert.match(checkout, /shipping_zone, shipping_coverage, base_shipping_fee, weight_surcharge, distance_surcharge/);
  assert.match(checkout, /actual_weight_kg, estimated_distance_km, distance_class, package_class/);
  assert.match(checkout, /shippingQuote\.provider/);
  assert.match(checkout, /shippingQuote\.courier_name/);
  assert.doesNotMatch(checkout, /req\.body\?\.(?:subtotal|shipping_fee|total|total_amount)/);
});

test('COD payment amount and checkout response include the backend shipping total', async () => {
  const source = await readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8');
  const checkout = source.slice(source.indexOf('export const createCheckout'), source.indexOf('const extractPaymongoEvent'));
  assert.match(checkout, /INSERT INTO payments[\s\S]*?amount[\s\S]*?\[order\.id,[\s\S]*?paymentMethod, total, expiresAt\]/);
  assert.match(checkout, /totals: \{ subtotal, shipping_fee: shippingFee, discount, tax: taxAmount, total \}/);
  assert.match(checkout, /shipping: shippingQuote/);
});

test('invoice and order serializers expose the saved shipping fee', async () => {
  const source = await readFile(new URL('./orderController.js', import.meta.url), 'utf8');
  assert.match(source, /shipping_fee: roundMoney\(order\.shipping_fee \|\| 0\)/);
  assert.match(source, /<td>Shipping Fee:<\/td>/);
  assert.match(source, /shippingFee\.toFixed\(2\)/);
});
