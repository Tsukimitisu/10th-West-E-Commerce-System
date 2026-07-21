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

test('test fixture accounts are explicit opt-in and production disabled', async () => {
  const source = await readFile(path.resolve(directory, '..', '..', 'scripts', 'seed-test-fixtures.js'), 'utf8');
  assert.match(source, /NODE_ENV/);
  assert.match(source, /production/);
  assert.match(source, /Test fixture accounts are disabled in production/);
  assert.match(source, /ENABLE_TEST_FIXTURES/);
  assert.match(source, /TEST_FIXTURE_PASSWORD/);
  assert.match(source, /\.test-credentials\.local/);
  assert.match(source, /customer@test\.local/);
  assert.match(source, /cashier@test\.local/);
  assert.match(source, /staff-noperms@test\.local/);
  assert.match(source, /staff@test\.local/);
  assert.match(source, /disabled@test\.local/);
  assert.match(source, /superadmin@test\.local/);
  assert.match(source, /active:\s*false/);
  assert.match(source, /STAFF_PERMISSIONS/);
  assert.match(source, /name = ANY\(\$2::text\[\]\)/);
  assert.ok(
    source.indexOf("await client.query('COMMIT')") < source.indexOf('await writeLocalCredentialMapping(password)'),
    'local credentials must only be written after the database transaction commits'
  );
  assert.doesNotMatch(source, /LocalTestPass123!|Admin@123|Staff@123|Customer@123/);
});
