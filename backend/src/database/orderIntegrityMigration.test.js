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
