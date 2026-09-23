import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('product view analytics query casts nullable parameters explicitly', async () => {
  const source = await readFile(path.join(directory, 'productController.js'), 'utf8');
  assert.match(source, /INSERT INTO product_views/);
  assert.match(source, /SELECT \$1::int, \$2::int, \$3::varchar\(128\)/);
  assert.match(source, /visitor_hash = \$3::varchar\(128\)/);
  assert.match(source, /user_id = \$2::int/);
});

test('product view analytics write failure is non-fatal after product validation', async () => {
  const source = await readFile(path.join(directory, 'productController.js'), 'utf8');
  assert.match(source, /Record product view analytics write error/);
  assert.match(source, /status\(202\)\.json\(\{ recorded: false, skipped: true \}\)/);
});
