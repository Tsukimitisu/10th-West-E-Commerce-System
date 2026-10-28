import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('order integrity migration quarantines evidence gaps without fabricating data', async () => {
  const migration = await readFile(
    path.resolve(directory, '../../migrations/202607030004_enforce_order_integrity.cjs'),
    'utf8'
  );

  assert.match(migration, /receipt_number = NULL/);
  assert.match(migration, /Legacy order has no order item records; source evidence required/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /Valid order % must contain at least one item/);
  assert.match(migration, /Valid order % must contain a payment record/);
  assert.doesNotMatch(migration, /SET receipt_number = 'POS-LEGACY-/);
});

test('expanded integrity migration supports granular historical quarantine statuses', async () => {
  const migration = await readFile(
    path.resolve(directory, '../../migrations/202607070002_expand_order_integrity_statuses.cjs'),
    'utf8'
  );

  assert.match(migration, /missing_items/);
  assert.match(migration, /payment_missing/);
  assert.match(migration, /receipt_missing/);
  assert.match(migration, /missing_timeline/);
  assert.match(migration, /missing_audit/);
  assert.doesNotMatch(migration, /SET receipt_number = 'POS-LEGACY-/);
});

test('quarantine script records audit evidence and only creates labeled stock baselines', async () => {
  const source = await readFile(
    path.resolve(directory, '../../scripts/quarantine-order-integrity.js'),
    'utf8'
  );

  assert.match(source, /data\.integrity_quarantine/);
  assert.match(source, /order_integrity/);
  assert.match(source, /legacy_baseline/);
  assert.match(source, /qa_fixture/);
  assert.match(source, /test_fixture/);
  assert.match(source, /Baseline movement from current stock_quantity/);
  assert.doesNotMatch(source, /POS-LEGACY-/);
});
