import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(backendRoot, 'migrations');
const entries = await readdir(migrationsDirectory, { withFileTypes: true });
const migrationFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.cjs'))
  .map((entry) => entry.name)
  .sort();

const failures = [];
const timestamps = new Map();
for (const file of migrationFiles) {
  const match = file.match(/^(\d{12})_[a-z0-9_]+\.cjs$/);
  if (!match) {
    failures.push(`Invalid migration filename: ${file}`);
    continue;
  }
  if (timestamps.has(match[1])) {
    failures.push(`Duplicate migration timestamp: ${file} and ${timestamps.get(match[1])}`);
  }
  timestamps.set(match[1], file);

  const source = await readFile(path.join(migrationsDirectory, file), 'utf8');
  if (!/exports\.up\s*=/.test(source)) failures.push(`Missing exports.up: ${file}`);
  if (!/exports\.down\s*=/.test(source)) failures.push(`Missing exports.down: ${file}`);
}

const retiredSqlPaths = [
  path.resolve(backendRoot, '..', 'supabase-setup.sql'),
  path.resolve(backendRoot, 'supabase-setup.sql'),
  path.resolve(backendRoot, '..', 'supabase-lint-fixes.sql'),
  path.resolve(backendRoot, 'alter.sql'),
];

for (const setupPath of retiredSqlPaths) {
  const source = await readFile(setupPath, 'utf8');
  if (!source.startsWith('-- DEPRECATED AND INTENTIONALLY NON-EXECUTABLE.')) {
    failures.push(`Legacy setup is not fail-closed: ${setupPath}`);
  }
  if (!/RAISE EXCEPTION '.*deprecated/.test(source)) {
    failures.push(`Legacy setup lacks execution guard: ${setupPath}`);
  }
  if (source.length > 1000 || /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i.test(source)) {
    failures.push(`Legacy SQL contains executable schema or data mutations: ${setupPath}`);
  }
}

for (const retiredScriptPath of [
  path.resolve(backendRoot, 'src/database/migrate.js'),
  path.resolve(backendRoot, 'src/database/migrate-auth.js'),
  path.resolve(backendRoot, 'src/database/seed.js'),
  path.resolve(backendRoot, 'src/database/seed-categories.js'),
  path.resolve(backendRoot, 'src/database/seed-sprint6.js'),
]) {
  const source = await readFile(retiredScriptPath, 'utf8');
  if (!source.startsWith('throw new Error(') || source.length > 500) {
    failures.push(`Legacy JavaScript entry point is not a guard-only stub: ${retiredScriptPath}`);
  }
  if (/\b(?:pool\.query|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|INSERT INTO|UPDATE\s+\w+|DELETE FROM)\b/i.test(source)) {
    failures.push(`Legacy JavaScript entry point still contains database mutations: ${retiredScriptPath}`);
  }
}

console.log(JSON.stringify({
  migration_count: migrationFiles.length,
  duplicate_timestamps: failures.filter((failure) => failure.startsWith('Duplicate')).length,
  status: failures.length ? 'failed' : 'passed',
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
