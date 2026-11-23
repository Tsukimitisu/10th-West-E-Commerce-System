import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cart = readFileSync(new URL('../context/CartContext.jsx', import.meta.url), 'utf8');
test('cart displays only the server-validated, capped discount for the validated subtotal', () => {
  const calculation = cart.slice(cart.indexOf('  let discountAmount ='), cart.indexOf('  const total = Math.max(0, subtotal - discountAmount)'));
  const amount = new Function('discount', 'subtotal', `${calculation};return discountAmount;`);
  assert.equal(amount(null, 230), 0);
  assert.equal(amount({ code: 'OWNER20', type: 'percentage', value: 20, validatedAmount: 40, validatedSubtotal: 230 }, 230), 40);
  assert.equal(amount({ code: 'OWNER20', type: 'percentage', value: 20, validatedAmount: 40, validatedSubtotal: 230 }, 115), 0);
});

test('promo validation always uses backend and failed Buy Now validation clears the previous promo', () => {
  const api = readFileSync(new URL('../services/api.js', import.meta.url), 'utf8');
  const validation = api.slice(api.indexOf('export const validateDiscount ='), api.indexOf('export const validateDiscountCode'));
  assert.doesNotMatch(validation, /supabase|discountAmount\s*=/);
  assert.match(validation, /result\.valid !== true/);
  const checkout = readFileSync(new URL('../pages/customer/Checkout.jsx', import.meta.url), 'utf8');
  const apply = checkout.slice(checkout.indexOf('const handleApplyPromo'), checkout.indexOf('const handleRemovePromo'));
  assert.match(apply, /catch[\s\S]*setBuyNowDiscount\(null\)/);
});

test('API rejects empty/unsuccessful promo responses and sends no client-calculated amount', async () => {
  const api = readFileSync(new URL('../services/api.js', import.meta.url), 'utf8');
  const source = api.slice(api.indexOf('export const validateDiscount ='), api.indexOf('export const validateDiscountCode')).replace('export const', 'const');
  let result, request;
  const validate = new Function('authenticatedFetch', 'API_URL', `${source};return validateDiscount;`)(async (_url, options) => {
    request = JSON.parse(options.body); return result;
  }, 'https://example.test/api');
  for (result of [{ valid: false }, { valid: true, discount: null, discountAmount: 0 }, { valid: true, discount: { code: 'OWNER20' }, discountAmount: 'bad' }]) {
    await assert.rejects(validate('OWNER20', 9999, [{ product_id: 1, quantity: 2 }]), /invalid or unavailable/);
  }
  result = { valid: true, discount: { code: 'OWNER20' }, discountAmount: 40 };
  assert.deepEqual(await validate('OWNER20', 9999, [{ product_id: 1, quantity: 2 }]), result);
  assert.deepEqual(request, { discount_code: 'OWNER20', items: [{ product_id: 1, quantity: 2 }] });
});
