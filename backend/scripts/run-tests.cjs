'use strict';

const { spawnSync } = require('node:child_process');

const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL
    || 'postgresql://test_runner:LocalOnly-9x%21@127.0.0.1:1/test_unit',
};

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
