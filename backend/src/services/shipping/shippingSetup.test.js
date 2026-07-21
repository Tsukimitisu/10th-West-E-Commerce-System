import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..', '..');

test('environment example uses generic provider configuration without legacy direct courier keys', async () => {
  const source = await readFile(path.join(repositoryRoot, 'backend', '.env.example'), 'utf8');
  assert.doesNotMatch(source, /JNT_API|JNT_MOCK_MODE/i);
  assert.match(source, /SHIPPING_PROVIDER/);
  assert.match(source, /TRACKING_PROVIDER/);
  assert.match(source, /SHIPPING_CARRIER/);
});
