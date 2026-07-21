import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('every retired SQL entry point is a guard-only stub without trailing mutations', async () => {
  for (const relativePath of [
    '../../../supabase-setup.sql',
    '../../supabase-setup.sql',
    '../../../supabase-lint-fixes.sql',
    '../../alter.sql',
  ]) {
    const source = await readFile(path.resolve(directory, relativePath), 'utf8');
    assert.equal(source.startsWith('-- DEPRECATED AND INTENTIONALLY NON-EXECUTABLE.'), true);
    assert.match(source, /RAISE EXCEPTION '.*deprecated/);
    assert.ok(source.length < 1000);
    assert.doesNotMatch(source, /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i);
  }
});

test('retired migration and seed scripts contain no executable database logic', async () => {
  for (const fileName of [
    'migrate.js',
    'migrate-auth.js',
    'seed.js',
    'seed-categories.js',
    'seed-sprint6.js',
  ]) {
    const source = await readFile(path.resolve(directory, fileName), 'utf8');
    assert.equal(source.startsWith('throw new Error('), true);
    assert.ok(source.length < 500);
    assert.doesNotMatch(source, /\b(?:pool\.query|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|INSERT INTO|UPDATE\s+\w+|DELETE FROM)\b/i);
  }
});
