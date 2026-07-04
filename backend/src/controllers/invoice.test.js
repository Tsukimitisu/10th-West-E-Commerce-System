import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeInvoiceHtml } from './orderController.js';
import { readFile } from 'node:fs/promises';

test('invoice HTML escapes active content and attributes', () => {
  assert.equal(
    escapeInvoiceHtml(`<script>alert("x")</script>'&`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;'
  );
});

test('invoice source contains no hardcoded registration or official receipt claim', async () => {
  const source = await readFile(new URL('./orderController.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /123-456-789|3217456|serves as an Official Receipt/);
});
