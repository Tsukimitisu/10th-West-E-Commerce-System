import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..', '..');

test('environment example selects internal fees and manual J&T waybills without external credentials', async () => {
  const source = await readFile(path.join(repositoryRoot, 'backend', '.env.example'), 'utf8');
  assert.match(source, /^SHIPPING_PROVIDER=internal$/m);
  assert.match(source, /^SHIPPING_FEE_PROVIDER=internal$/m);
  assert.match(source, /^SHIPPING_COVERAGE=luzon_only$/m);
  assert.match(source, /^DISTANCE_PROVIDER=internal$/m);
  assert.match(source, /^COURIER_PROVIDER=jnt$/m);
  assert.match(source, /^WAYBILL_PROVIDER=manual$/m);
  assert.match(source, /^TRACKING_PROVIDER=manual$/m);
  assert.match(source, /^JNT_COURIER_NAME=J&T Express$/m);
  assert.doesNotMatch(source, /BIGSELLER_|AFTERSHIP_|NINJA|SHIPMATES|JNT_API|JNT_MOCK_MODE/i);
});
