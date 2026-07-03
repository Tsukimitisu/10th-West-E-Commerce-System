import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('legacy setup SQL files fail before historical statements can execute', async () => {
  for (const relativePath of ['../../../supabase-setup.sql', '../../supabase-setup.sql']) {
    const source = await readFile(path.resolve(directory, relativePath), 'utf8');
    assert.equal(source.startsWith('-- DEPRECATED AND INTENTIONALLY NON-EXECUTABLE.'), true);
    assert.match(source.slice(0, 500), /RAISE EXCEPTION '.*deprecated/);
  }
});
