import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  directory,
  '../../migrations/202607030001_lock_down_supabase_rls.cjs'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const schemaMigration = fs.readFileSync(
  path.resolve(directory, '../../migrations/202607030002_revoke_public_schema_access.cjs'),
  'utf8'
);

test('RLS lockdown revokes browser roles and defaults to backend-only policies', () => {
  assert.match(migration, /REVOKE ALL ON SCHEMA public FROM anon/i);
  assert.match(migration, /REVOKE ALL ON TABLE .* FROM authenticated/i);
  assert.match(migration, /CREATE POLICY backend_service_role_only/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES.*REVOKE ALL ON TABLES FROM PUBLIC/is);
  assert.doesNotMatch(migration, /ANY\s*\(\s*ARRAY\s*\[\s*'anon'/i);
});

test('RLS lockdown does not add public storefront exceptions', () => {
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).* TO (?:anon|authenticated)/i);
});

test('RLS lockdown revokes inherited PUBLIC schema access', () => {
  assert.match(schemaMigration, /REVOKE ALL ON SCHEMA public FROM PUBLIC/i);
  assert.doesNotMatch(schemaMigration, /GRANT .* TO (?:anon|authenticated)/i);
});
