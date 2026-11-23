import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const migrationName = (migration) => {
  const value = typeof migration === 'string'
    ? migration
    : migration?.name || migration?.file;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Migration list contains an invalid entry.');
  }
  return path.basename(value.trim());
};

export const buildMigrationCheckReport = ({ completed = [], pending = [] } = {}) => {
  const pendingMigrations = pending.map(migrationName);
  return {
    status: pendingMigrations.length === 0 ? 'passed' : 'failed',
    applied_count: completed.length,
    pending_count: pendingMigrations.length,
    pending_migrations: pendingMigrations,
  };
};

export const migrationCheckExitCode = (report) => (
  report?.status === 'passed'
  && report?.pending_count === 0
    ? 0
    : 1
);

const failedReport = () => ({
  status: 'failed',
  applied_count: null,
  pending_count: null,
  pending_migrations: [],
  code: 'MIGRATION_CHECK_UNAVAILABLE',
});

export const createCanonicalMigrationClient = () => {
  const knex = require('knex');
  const knexConfig = require('../knexfile.cjs');
  return {
    client: knex(knexConfig),
    migrationConfig: knexConfig.migrations,
  };
};

export const checkPendingMigrations = async ({
  createClient = createCanonicalMigrationClient,
  logger = console,
} = {}) => {
  let client;
  let report;

  try {
    const canonical = await createClient();
    client = canonical.client;
    const [completed, pending] = await client.migrate.list(canonical.migrationConfig);
    report = buildMigrationCheckReport({ completed, pending });
  } catch {
    report = failedReport();
  } finally {
    if (client) {
      try {
        await client.destroy();
      } catch {
        report = failedReport();
      }
    }
  }

  const output = JSON.stringify(report, null, 2);
  if (migrationCheckExitCode(report) === 0) logger.log(output);
  else logger.error(output);

  return {
    ...report,
    exitCode: migrationCheckExitCode(report),
  };
};

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const result = await checkPendingMigrations();
  process.exitCode = result.exitCode;
}
