import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..', '..');

test('setup SQL uses generic provider shipping configuration', async () => {
  for (const file of [
    path.join(repositoryRoot, 'supabase-setup.sql'),
    path.join(repositoryRoot, 'backend', 'supabase-setup.sql'),
  ]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\('jnt'|JNT_API|JNT_MOCK_MODE/i);
    assert.match(source, /SHIPPING_PROVIDER/);
    assert.match(source, /TRACKING_PROVIDER/);
    assert.match(source, /SHIPPING_CARRIER/);
    assert.equal((source.match(/\('standard', 'Standard Provider Delivery'/g) || []).length, 1);
  }
});
