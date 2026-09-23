'use strict';

const { spawnSync } = require('node:child_process');

const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL
    || 'postgresql://test_runner:LocalOnly-9x%21@127.0.0.1:1/test_unit',
  DB_READ_MODE: 'postgres',
};

// Define live aliases as empty instead of deleting them. The deterministic
// backend environment loader treats defined process values as authoritative,
// so backend/.env cannot silently refill production/development credentials
// inside the unit-test process.
for (const name of [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'SEMAPHORE_API_KEY',
  'PHONE_VERIFICATION_ENABLED',
]) {
  testEnvironment[name] = '';
}

const result = spawnSync(
  process.execPath,
  ['--test', ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: testEnvironment,
    stdio: 'inherit',
  }
);

if (result.error) {
  console.error('Unable to start the Node.js test runner.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
