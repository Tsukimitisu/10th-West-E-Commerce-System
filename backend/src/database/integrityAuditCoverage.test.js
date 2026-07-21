import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('integrity audit covers stock, receipts, COD/POS payments, references, and fixture baselines', async () => {
  const source = await readFile(new URL('../../scripts/integrity-audit.js', import.meta.url), 'utf8');
  for (const invariant of [
    'duplicate_receipts',
    'invalid_product_stock',
    'invalid_variant_stock',
    'valid_cod_orders_without_payment',
    'valid_pos_orders_without_paid_payment',
    'unquarantined_null_product_items',
    'orphan_order_items',
    'orphan_payments',
    'orphan_stock_reservations',
    'orphan_stock_movements',
    'orphan_returns',
    'orphan_return_items',
    'orphan_chat_messages',
    'orphan_chat_participants',
    'stocked_products_without_movements',
  ]) {
    assert.match(source, new RegExp(`audit\\.${invariant}`));
  }
});
