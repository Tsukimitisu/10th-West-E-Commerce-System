import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('seed accounts require explicit development-only credentials', async () => {
  const source = await readFile(path.join(directory, 'seed.js'), 'utf8');
  assert.match(source, /\['development', 'test'\]/);
  assert.match(source, /ALLOW_DEVELOPMENT_SEED/);
  assert.match(source, /SEED_SUPER_ADMIN_PASSWORD/);
  assert.doesNotMatch(source, /Admin@123|Staff@123|Customer@123/);
});

test('seeded account security script requires explicit confirmation', async () => {
  const source = await readFile(path.resolve(directory, '..', '..', 'scripts', 'secure-seeded-accounts.js'), 'utf8');
  assert.match(source, /CONFIRM_SECURE_SEEDED_ACCOUNTS/);
  assert.match(source, /is_active = false/);
  assert.match(source, /UPDATE sessions SET is_active = false/);
});
