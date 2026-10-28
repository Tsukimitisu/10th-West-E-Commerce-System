import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDatabaseConnection } from './database-check.js';

const fakeConfig = Object.freeze({
  pgPoolConfig: Object.freeze({
    connectionString: 'postgresql://diagnostic:never-logged@db.example.test:5432/app',
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    ssl: Object.freeze({ rejectUnauthorized: false }),
  }),
  safeMetadata: Object.freeze({
    environmentFile: 'backend/.env',
    envFilePresent: true,
    connectionVariable: 'DATABASE_URL',
    connectionSource: 'backend/.env',
    host: 'db.example.test',
    port: 5432,
    database: 'app',
    connectionMode: 'direct',
    projectRef: 'exampleproject',
    ssl: Object.freeze({ enabled: true, mode: 'require' }),
  }),
});

const createLogger = () => {
  const lines = [];
  return {
    lines,
    logger: {
      log: (message) => lines.push(String(message)),
      warn: (message) => lines.push(String(message)),
      error: (message) => lines.push(String(message)),
    },
  };
};

test('database check reports safe metadata and verifies migration table access', async () => {
  class PassingPool {
    constructor(options) {
      assert.equal(options.max, 1);
    }

    async query(sql) {
      if (String(sql).includes('clock_timestamp')) {
        return {
          rows: [{
            connection_ok: 1,
            database_name: 'app',
            database_user: 'diagnostic',
            server_time: new Date('2026-07-21T00:00:00.000Z'),
          }],
        };
      }
      if (String(sql).includes('to_regclass')) {
        return { rows: [{ migration_table: 'knex_migrations' }] };
      }
      return { rows: [{ id: 1 }] };
    }

    async end() {}
  }

  const output = createLogger();
  const result = await checkDatabaseConnection({
    Pool: PassingPool,
    config: fakeConfig,
    logger: output.logger,
  });

  assert.equal(result.ok, true);
  assert.match(output.lines.join('\n'), /Connection: PASS/);
  assert.match(output.lines.join('\n'), /Migration table access: PASS/);
  assert.doesNotMatch(output.lines.join('\n'), /never-logged/);
  assert.doesNotMatch(output.lines.join('\n'), /postgresql:\/\//);
});

test('database check classifies tenant rejection without leaking raw errors', async () => {
  class FailingPool {
    async query() {
      const error = new Error('Tenant or user not found: secret-marker');
      error.code = 'XX000';
      throw error;
    }

    async end() {}
  }

  const output = createLogger();
  const result = await checkDatabaseConnection({
    Pool: FailingPool,
    config: fakeConfig,
    logger: output.logger,
  });

  assert.deepEqual(result, { ok: false, code: 'DATABASE_CREDENTIALS_REJECTED' });
  assert.match(output.lines.join('\n'), /DATABASE_CREDENTIALS_REJECTED/);
  assert.doesNotMatch(output.lines.join('\n'), /secret-marker/);
  assert.doesNotMatch(output.lines.join('\n'), /Tenant or user not found/);
});
