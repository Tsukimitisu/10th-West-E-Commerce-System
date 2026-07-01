import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('customer-compatible order serialization excludes legacy courier metadata', async () => {
  const source = await readFile(path.join(directory, 'orderController.js'), 'utf8');
  const mapper = source.slice(
    source.indexOf('const mapOrderRecord'),
    source.indexOf('const getMemoryOrderBundle')
  );
  assert.doesNotMatch(mapper, /courier_metadata/);
  assert.doesNotMatch(mapper, /waybill_label_payload/);
  assert.match(mapper, /courier:/);
  assert.match(mapper, /waybill_number:/);
});
