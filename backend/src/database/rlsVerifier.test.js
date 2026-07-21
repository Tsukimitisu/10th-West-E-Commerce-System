import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.resolve(directory, '..', '..', 'scripts', 'verify-rls.js');

test('RLS verifier distinguishes unconditional TRUE from missing-ok function arguments', async () => {
  const source = await readFile(verifierPath, 'utf8');

  assert.match(source, /\^\[\[:space:\]\]\*\[\(\]\*/);
  assert.doesNotMatch(source, /\(\^\|\[\^a-z_\]\)true/);
  assert.match(source, /current_setting\('role', true\)/);
});
