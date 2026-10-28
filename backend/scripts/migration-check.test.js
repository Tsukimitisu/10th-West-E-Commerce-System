import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMigrationCheckReport,
  checkPendingMigrations,
  migrationCheckExitCode,
} from './migration-check.js';

const createLogger = () => {
  const lines = [];
  return {
    lines,
    logger: {
      log: (value) => lines.push(String(value)),
      error: (value) => lines.push(String(value)),
    },
  };
};

test('migration check report fails closed and lists only pending migration names', () => {
  const pending = buildMigrationCheckReport({
    completed: [{ name: '202604100001_initial_schema.cjs' }],
    pending: [
      { file: '202607210001_codify_runtime_schema_requirements.cjs', directory: 'C:/secret/database/path' },
    ],
  });
  assert.deepEqual(pending, {
    status: 'failed',
    applied_count: 1,
    pending_count: 1,
    pending_migrations: ['202607210001_codify_runtime_schema_requirements.cjs'],
  });
  assert.equal(migrationCheckExitCode(pending), 1);

  const current = buildMigrationCheckReport({ completed: ['one.cjs'], pending: [] });
  assert.equal(current.status, 'passed');
  assert.equal(migrationCheckExitCode(current), 0);
});

test('migration check uses migrate.list and reliably closes the client', async () => {
  const calls = [];
  const migrationConfig = { tableName: 'knex_migrations' };
  const output = createLogger();
  const result = await checkPendingMigrations({
    createClient: () => ({
      migrationConfig,
      client: {
        migrate: {
          async list(config) {
            calls.push(['list', config]);
            return [[{ name: 'one.cjs' }], []];
          },
        },
        async destroy() {
          calls.push(['destroy']);
        },
      },
    }),
    logger: output.logger,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls, [['list', migrationConfig], ['destroy']]);
  assert.doesNotMatch(output.lines.join('\n'), /connection|database_url|postgresql:\/\//i);
});

test('migration check sanitizes list failures and still closes the client', async () => {
  let destroyed = false;
  const output = createLogger();
  const result = await checkPendingMigrations({
    createClient: () => ({
      migrationConfig: {},
      client: {
        migrate: {
          async list() {
            throw new Error('postgresql://user:secret-marker@private.example/database');
          },
        },
        async destroy() {
          destroyed = true;
        },
      },
    }),
    logger: output.logger,
  });

  assert.equal(destroyed, true);
  assert.equal(result.exitCode, 1);
  assert.equal(result.code, 'MIGRATION_CHECK_UNAVAILABLE');
  assert.doesNotMatch(output.lines.join('\n'), /secret-marker|postgresql:\/\//i);
});
