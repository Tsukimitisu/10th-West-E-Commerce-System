import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import databaseConfigModule from '../src/config/databaseConfig.cjs';

const {
  DatabaseConfigurationError,
  getDatabaseConfig,
  sanitizeDatabaseError,
} = databaseConfigModule;

const ERROR_CODE_MAP = Object.freeze({
  DB_AUTHENTICATION_FAILED: 'DATABASE_CREDENTIALS_REJECTED',
  DB_TENANT_NOT_FOUND: 'DATABASE_CREDENTIALS_REJECTED',
  DB_TLS_ERROR: 'DATABASE_SSL_REQUIRED',
  DB_DNS_ERROR: 'DATABASE_UNREACHABLE',
  DB_CONNECTION_REFUSED: 'DATABASE_UNREACHABLE',
  DB_CONNECTION_RESET: 'DATABASE_UNREACHABLE',
  DB_TIMEOUT: 'DATABASE_UNREACHABLE',
  DB_CAPACITY_EXCEEDED: 'DATABASE_UNREACHABLE',
  DB_UNAVAILABLE: 'DATABASE_UNREACHABLE',
  DB_DATABASE_NOT_FOUND: 'DATABASE_CREDENTIALS_REJECTED',
  DB_SCHEMA_NOT_READY: 'DATABASE_SCHEMA_NOT_READY',
  DB_PERMISSION_DENIED: 'DATABASE_PERMISSION_DENIED',
});

const publicErrorCode = (error, sanitized) => {
  if (error instanceof DatabaseConfigurationError || error?.name === 'DatabaseConfigurationError') {
    return error.code || 'DATABASE_CONFIG_INVALID';
  }
  return ERROR_CODE_MAP[sanitized.code] || 'DATABASE_UNAVAILABLE';
};

const writeMetadata = (logger, metadata) => {
  logger.log(`Environment file: ${metadata.environmentFile} (${metadata.envFilePresent ? 'present' : 'missing'})`);
  logger.log(`Connection variable: ${metadata.connectionVariable}`);
  logger.log(`Connection source: ${metadata.connectionSource}`);
  logger.log(`Database host: ${metadata.host}`);
  logger.log(`Database port: ${metadata.port}`);
  logger.log(`Database name: ${metadata.database}`);
  logger.log(`Connection mode: ${metadata.connectionMode}`);
  logger.log(`Supabase project reference: ${metadata.projectRef || '(not detected)'}`);
  logger.log(`SSL: ${metadata.ssl.enabled ? `enabled (${metadata.ssl.mode})` : 'disabled'}`);
};

export const checkDatabaseConnection = async ({
  Pool = pg.Pool,
  config,
  logger = console,
} = {}) => {
  let databaseConfig;
  try {
    databaseConfig = config || getDatabaseConfig();
    writeMetadata(logger, databaseConfig.safeMetadata);
  } catch (error) {
    const sanitized = sanitizeDatabaseError(error);
    logger.error('Connection: FAIL');
    logger.error(`Error: ${publicErrorCode(error, sanitized)}`);
    logger.error(`Detail: ${sanitized.message}`);
    return { ok: false, code: publicErrorCode(error, sanitized) };
  }

  const diagnosticPoolConfig = {
    ...databaseConfig.pgPoolConfig,
    max: 1,
    connectionTimeoutMillis: Math.min(
      databaseConfig.pgPoolConfig.connectionTimeoutMillis || 5000,
      5000
    ),
    query_timeout: Math.min(databaseConfig.pgPoolConfig.query_timeout || 5000, 5000),
    statement_timeout: Math.min(databaseConfig.pgPoolConfig.statement_timeout || 5000, 5000),
  };
  const pool = new Pool(diagnosticPoolConfig);

  try {
    const connectionResult = await pool.query(`
      SELECT
        1 AS connection_ok,
        current_database() AS database_name,
        current_user AS database_user,
        clock_timestamp() AS server_time
    `);
    const row = connectionResult.rows[0];
    logger.log('Connection: PASS');
    logger.log(`Connected database: ${row.database_name}`);
    logger.log(`Connected PostgreSQL user: ${row.database_user}`);
    logger.log(`Server time: ${new Date(row.server_time).toISOString()}`);

    const migrationTableResult = await pool.query(
      "SELECT to_regclass('public.knex_migrations')::text AS migration_table"
    );
    if (!migrationTableResult.rows[0]?.migration_table) {
      logger.error('Migration table access: FAIL');
      logger.error('Error: DATABASE_SCHEMA_NOT_READY');
      return { ok: false, code: 'DATABASE_SCHEMA_NOT_READY' };
    }

    await pool.query('SELECT id FROM public.knex_migrations LIMIT 1');
    logger.log('Migration table access: PASS');
    if (databaseConfig.safeMetadata.connectionMode === 'transaction') {
      logger.warn('Migration advisory: transaction pooler detected; use the current Supabase Connect panel direct or session URL when migration session semantics require it.');
    }
    return {
      ok: true,
      code: 'DATABASE_CONNECTION_OK',
      metadata: databaseConfig.safeMetadata,
    };
  } catch (error) {
    const sanitized = sanitizeDatabaseError(error);
    const code = publicErrorCode(error, sanitized);
    logger.error('Connection: FAIL');
    logger.error(`Error: ${code}`);
    logger.error(`Detail: ${sanitized.message}`);
    return { ok: false, code };
  } finally {
    await pool.end().catch(() => {});
  }
};

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const result = await checkDatabaseConnection();
  if (!result.ok) process.exitCode = 1;
}
