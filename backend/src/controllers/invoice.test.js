import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import { escapeInvoiceHtml, getOrderInvoice } from './orderController.js';
import { readFile } from 'node:fs/promises';
import { renderOrderInvoice } from '../services/orderInvoice.js';

test('invoice HTML escapes active content and attributes', () => {
  assert.equal(
    escapeInvoiceHtml(`<script>alert("x")</script>'&`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;'
  );
});

test('invoice renders complete configured business and customer contact details', async () => {
  const previousPhone = process.env.BUSINESS_PHONE;
  process.env.BUSINESS_PHONE = '+63 917 123 4567';
  mock.method(pool, 'query', async (sql, params = []) => {
    const query = String(sql);
    if (query.includes('FROM orders o LEFT JOIN users')) {
      return { rows: [{
        id: 42,
        user_id: 7,
        customer_name: 'Customer Name',
        customer_email: 'customer@example.test',
        customer_phone: '+63 918 555 0123',
        shipping_address: 'Fallback address',
        shipping_address_snapshot: {
          recipient_name: 'Customer Name',
          phone: '+63 918 555 0123',
          street: '10 West Street',
          city: 'Quezon City',
          state: 'Metro Manila',
          postal_code: '1100',
          country: 'Philippines',
        },
        total_amount: 1150,
        shipping_fee: 150,
        discount_amount: 0,
        tax_amount: 0,
        payment_method: 'gcash',
        payment_status: 'paid',
        status: 'paid',
        courier_name: 'J&T Express',
        tracking_number: 'JT123456',
        created_at: '2026-09-04T00:00:00.000Z',
      }], rowCount: 1 };
    }
    if (query.includes('FROM order_items')) {
      return { rows: [{ product_name: 'Helmet', part_number: 'H-1', product_price: 1000, quantity: 1 }], rowCount: 1 };
    }
    if (query.includes('FROM system_settings')) {
      const category = params[0];
      if (category === 'store') return { rows: [
        { key: 'name', value: '10th West Moto' },
        { key: 'email', value: 'shop@example.test' },
        { key: 'address', value: '10 West Business Address' },
      ] };
      return { rows: [] };
    }
    return { rows: [] };
  });
  const response = {
    body: '',
    setHeader() {},
    send(value) { this.body = value; return this; },
    status() { return this; },
    json() { return this; },
  };
  try {
    await getOrderInvoice({ params: { id: '42' }, user: { id: 7, role: 'customer' } }, response);
    assert.match(response.body, /\+63 917 123 4567/);
    assert.match(response.body, /\+63 918 555 0123/);
    assert.match(response.body, /10 West Street/);
    assert.match(response.body, /Payment Status:<\/strong> Paid/);
    assert.match(response.body, /@page\{size:A4/);
    assert.match(response.body, /10th-west-logo\.png/);
    assert.match(response.body, /BILL TO/);
    assert.match(response.body, /SHIP TO/);
    assert.doesNotMatch(response.body, /VAT Inclusive|12%|PayMongo.*(?:sk_test|secret)/);
    assert.match(response.body, /1?150\.00/);
    assert.match(response.body, /Tracking Number:<\/strong> JT123456/);
  } finally {
    mock.restoreAll();
    if (previousPhone === undefined) delete process.env.BUSINESS_PHONE;
    else process.env.BUSINESS_PHONE = previousPhone;
  }
});

test('invoice source contains no hardcoded registration or official receipt claim', async () => {
  const source = (await readFile(new URL('./orderController.js', import.meta.url), 'utf8')) + (await readFile(new URL('../services/orderInvoice.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /123-456-789|3217456|serves as an Official Receipt/);
  assert.match(source, /BUSINESS_PHONE/);
  assert.match(source, /customer_phone/);
  assert.match(source, /Payment Status:/);
  assert.match(source, /Tracking Number:/);
});

test('COD invoice stays Payment Pending and no provider secrets or invented VAT appear', () => {
  const { html, csp } = renderOrderInvoice({
    order: { id: 9, payment_method: 'cod', payment_status: 'pending', status: 'shipped', payment_reference: 'private-provider-id', payment_metadata: { secret: 'private-secret' } },
    items: [], store: { name: '10th West', address: '', email: '', phone: '' }, shipping: {}, address: '',
    totals: { subtotal: 100, discount: 0, shippingFee: 0, tax: 0, totalAmount: 100 },
    legalLines: [], origin: 'https://shop.example.test', escape: escapeInvoiceHtml,
  });
  assert.match(html, /Cash on Delivery/); assert.match(html, /Payment Pending/);
  assert.doesNotMatch(html, /private-provider-id|private-secret|VAT Inclusive|12%/);
  const nonce = html.match(/<script nonce="([^"]+)"/)[1]; assert.ok(csp.includes(`'nonce-${nonce}'`));
});
test('invoice prints exact stored discount/tax/total without recalculating a tax rate', () => {
  const { html } = renderOrderInvoice({
    order: { id: 10, payment_method: 'gcash', payment_status: 'paid' },
    items: [{ product_name: '<script>bad</script>', part_number: 'PART-1', product_price: 1000, quantity: 1 }],
    store: { name: '10th West' }, shipping: {}, address: '',
    totals: { subtotal: 1000, discount: 50, shippingFee: 150, tax: 99, totalAmount: 1199 }, taxName: 'Tax',
    legalLines: [], origin: 'https://shop.example.test', escape: escapeInvoiceHtml,
  });
  assert.match(html, /&#8369;99\.00/); assert.match(html, /&#8369;1199\.00/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad|12%/);
});
