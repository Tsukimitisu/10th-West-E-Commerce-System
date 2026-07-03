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

for (const setupPath of [
  path.resolve(backendRoot, '..', 'supabase-setup.sql'),
  path.resolve(backendRoot, 'supabase-setup.sql'),
]) {
  const source = await readFile(setupPath, 'utf8');
  if (!source.startsWith('-- DEPRECATED AND INTENTIONALLY NON-EXECUTABLE.')) {
    failures.push(`Legacy setup is not fail-closed: ${setupPath}`);
  }
  if (!/RAISE EXCEPTION '.*deprecated/.test(source)) {
    failures.push(`Legacy setup lacks execution guard: ${setupPath}`);
  }
}

console.log(JSON.stringify({
  migration_count: migrationFiles.length,
  duplicate_timestamps: failures.filter((failure) => failure.startsWith('Duplicate')).length,
  status: failures.length ? 'failed' : 'passed',
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
