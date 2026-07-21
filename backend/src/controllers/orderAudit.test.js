import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const readController = (name) => readFile(new URL(`./${name}`, import.meta.url), 'utf8');

const auditMetadataSnippets = (source) => (
  [...source.matchAll(/writeAuditLog\([\s\S]{0,1200}?metadata:\s*\{[\s\S]{0,600}?\}/g)]
    .map((match) => match[0])
);

test('customer checkout creation writes order, payment, and provider audit records', async () => {
  const source = await readController('secureCheckoutController.js');
  const createCheckout = source.slice(
    source.indexOf('export const createCheckout'),
    source.indexOf('const extractPaymongoEvent'),
  );

  assert.match(createCheckout, /action:\s*'order\.create'/);
  assert.match(createCheckout, /entityType:\s*'order'/);
  assert.match(createCheckout, /action:\s*'payment\.create'/);
  assert.match(createCheckout, /entityType:\s*'payment'/);
  assert.match(createCheckout, /action:\s*'payment\.checkout_session\.create'/);
  assert.match(createCheckout, /action:\s*'payment\.checkout_session\.failed'/);
  assert.match(createCheckout, /source:\s*'customer_checkout'/);
  assert.match(createCheckout, /actor_role:\s*req\.user\.role/);
  assert.match(createCheckout, /order_id:\s*order\.id/);
  assert.match(createCheckout, /payment_id:\s*payment\.id/);
  assert.match(createCheckout, /idempotency_key:\s*idempotencyKey/);
});

test('POS creation and void paths write order, payment, receipt, and void audit records', async () => {
  const source = await readController('posController.js');
  const createPosOrder = source.slice(
    source.indexOf('export const createPosOrder'),
    source.indexOf('export const listPosOrders'),
  );
  const voidPosOrder = source.slice(
    source.indexOf('export const voidPosOrder'),
    source.indexOf('export const getPosDailySummary'),
  );

  assert.match(createPosOrder, /action:\s*'order\.create'/);
  assert.match(createPosOrder, /entityType:\s*'order'/);
  assert.match(createPosOrder, /action:\s*'payment\.create'/);
  assert.match(createPosOrder, /entityType:\s*'payment'/);
  assert.match(createPosOrder, /action:\s*'receipt\.create'/);
  assert.match(createPosOrder, /entityType:\s*'receipt'/);
  assert.match(createPosOrder, /source:\s*'pos'/);
  assert.match(createPosOrder, /actor_role:\s*req\.user\.role/);
  assert.match(createPosOrder, /order_id:\s*order\.id/);
  assert.match(createPosOrder, /payment_id:\s*payment\.id/);
  assert.match(createPosOrder, /receipt_number:\s*receiptNumber/);
  assert.match(createPosOrder, /idempotency_key:\s*idempotencyKey/);

  assert.match(voidPosOrder, /action:\s*'pos\.void'/);
  assert.match(voidPosOrder, /entityType:\s*'order'/);
  assert.match(voidPosOrder, /source:\s*'pos'/);
  assert.match(voidPosOrder, /receipt_number:\s*order\.receipt_number/);
});

test('idempotent replay returns before audit creation and does not duplicate audit logs', async () => {
  const checkoutSource = await readController('secureCheckoutController.js');
  const checkoutReplay = checkoutSource.indexOf('if (!idempotency.claimed)');
  const checkoutOrderInsert = checkoutSource.indexOf('INSERT INTO orders', checkoutReplay);
  const checkoutReplaySnippet = checkoutSource.slice(checkoutReplay, checkoutOrderInsert);
  assert.match(checkoutReplaySnippet, /return res\.status\(saved\.response_status \|\| 200\)\.json\(saved\.response_body\)/);
  assert.doesNotMatch(checkoutReplaySnippet, /writeAuditLog/);

  const posSource = await readController('posController.js');
  const posReplay = posSource.indexOf('if (!idempotency.claimed)');
  const posOrderInsert = posSource.indexOf('INSERT INTO orders', posReplay);
  const posReplaySnippet = posSource.slice(posReplay, posOrderInsert);
  assert.match(posReplaySnippet, /return res\.status\(saved\.response_status \|\| 201\)\.json\(saved\.response_body\)/);
  assert.doesNotMatch(posReplaySnippet, /writeAuditLog/);
});

test('audit metadata snippets do not include secret-shaped provider fields', async () => {
  const source = `${await readController('secureCheckoutController.js')}\n${await readController('posController.js')}`;
  const snippets = auditMetadataSnippets(source);
  assert.ok(snippets.length >= 8);
  const combined = snippets.join('\n');

  assert.doesNotMatch(combined, /password|secret|api_key|authorization|rawBody|signatureHeader/i);
  assert.doesNotMatch(combined, /provider_response|providerResponse|raw:/i);
});

test('COD delivery atomically captures the payment and records delivery audit evidence', async () => {
  const source = await readController('orderController.js');
  const start = source.indexOf('export const confirmOrderDelivery');
  const end = source.indexOf('export const confirmOrderReceipt', start);
  const handler = source.slice(start, end);

  assert.match(handler, /SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/);
  assert.match(handler, /SET status = 'paid', paid_at = COALESCE/);
  assert.match(handler, /payment_status = CASE WHEN payment_method = 'cod' THEN 'paid'/);
  assert.match(handler, /action:\s*'order\.delivery\.confirm'/);
  assert.ok(handler.indexOf("await client.query('COMMIT')") > handler.indexOf("action: 'order.delivery.confirm'"));
});
