'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BACKEND_ENV_PATH,
  BACKEND_ENV_SOURCE,
  PROCESS_ENV_SOURCE,
  mergeBackendEnvironment,
} = require('./environment.cjs');
const {
  DatabaseConfigurationError,
  classifyDatabaseError,
  createDatabaseConfig,
  isDatabaseUnavailableError,
  parseDatabaseUrl,
  sanitizeDatabaseError,
  selectDatabaseUrl,
} = require('./databaseConfig.cjs');

const directUrl = (projectRef = 'projectalpha') =>
  `postgresql://postgres:LocalOnly-9x%21@db.${projectRef}.supabase.co:5432/postgres`;
const poolerUrl = (projectRef = 'projectalpha', port = 6543) =>
  `postgresql://postgres.${projectRef}:LocalOnly-9x%21@aws-1-ap-southeast-1.pooler.supabase.com:${port}/postgres`;

test('backend environment merge preserves process values and reports each source', () => {
  const processEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'process-value',
  };
  const merged = mergeBackendEnvironment({
    processEnv,
    fileEnv: {
      DATABASE_URL: 'file-value',
      SUPABASE_DB_URL: 'file-supabase-value',
    },
  });

  assert.equal(merged.env.DATABASE_URL, 'process-value');
  assert.equal(merged.env.SUPABASE_DB_URL, 'file-supabase-value');
  assert.equal(merged.sources.DATABASE_URL, PROCESS_ENV_SOURCE);
  assert.equal(merged.sources.SUPABASE_DB_URL, BACKEND_ENV_SOURCE);
  assert.equal(BACKEND_ENV_PATH.endsWith('backend\\.env') || BACKEND_ENV_PATH.endsWith('backend/.env'), true);
});

test('connection selection uses test override only in test and otherwise preserves alias order', () => {
  const aliasedUrl = poolerUrl('supabaseproject');
  const urls = {
    TEST_DATABASE_URL: poolerUrl('testproject'),
    SUPABASE_DB_URL: aliasedUrl,
    DATABASE_URL: aliasedUrl,
  };

  assert.equal(selectDatabaseUrl({
    env: { NODE_ENV: 'test', ...urls },
    sources: { TEST_DATABASE_URL: PROCESS_ENV_SOURCE },
  }).variable, 'TEST_DATABASE_URL');
  assert.equal(selectDatabaseUrl({ env: { NODE_ENV: 'development', ...urls } }).variable, 'SUPABASE_DB_URL');
  assert.equal(selectDatabaseUrl({
    env: { NODE_ENV: 'development', SUPABASE_DB_URL: '', DATABASE_URL: directUrl('databaseproject') },
  }).variable, 'DATABASE_URL');
  assert.throws(
    () => selectDatabaseUrl({
      env: {
        NODE_ENV: 'development',
        SUPABASE_DB_URL: poolerUrl('projectalpha'),
        DATABASE_URL: directUrl('projectbeta'),
      },
    }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'DATABASE_URL_CONFLICT'
  );
  assert.throws(
    () => selectDatabaseUrl({ env: { NODE_ENV: 'development' } }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'DATABASE_URL_MISSING'
  );
  assert.throws(
    () => selectDatabaseUrl({
      env: { NODE_ENV: 'test', DATABASE_URL: directUrl('mustnotfallback') },
    }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'TEST_DATABASE_URL_MISSING'
  );
});

test('database URL parser validates protocol, host, port, database, username, password, and placeholders', () => {
  const parsed = parseDatabaseUrl(poolerUrl());
  assert.deepEqual(
    {
      protocol: parsed.protocol,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      username: parsed.username,
      passwordPresent: parsed.passwordPresent,
    },
    {
      protocol: 'postgresql',
      host: 'aws-1-ap-southeast-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      username: 'postgres.projectalpha',
      passwordPresent: true,
    }
  );

  const invalidCases = [
    ['DB_URL_PROTOCOL_INVALID', 'https://user:secret@db.example.com:5432/app'],
    ['DB_URL_INVALID', 'postgresql://user:secret@:5432/app'],
    ['DATABASE_HOST_INVALID', 'postgresql://user:secret@-bad.example:5432/app'],
    ['DB_URL_INVALID', 'postgresql://user:secret@db.example.com:99999/app'],
    ['DB_URL_DATABASE_INVALID', 'postgresql://user:secret@db.example.com:5432/'],
    ['DB_URL_USERNAME_INVALID', 'postgresql://:secret@db.example.com:5432/app'],
    ['DB_URL_PASSWORD_INVALID', 'postgresql://user@db.example.com:5432/app'],
    ['DB_URL_PLACEHOLDER', 'postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres'],
  ];

  for (const [expectedCode, value] of invalidCases) {
    assert.throws(
      () => parseDatabaseUrl(value),
      (error) => error instanceof DatabaseConfigurationError && error.code === expectedCode
    );
  }
});

test('Supabase direct hosts and pooler usernames must match the configured project URL', () => {
  const direct = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: directUrl('projectalpha'),
      SUPABASE_URL: 'https://projectalpha.supabase.co',
    },
    sources: { DATABASE_URL: BACKEND_ENV_SOURCE },
  });
  assert.equal(direct.safeMetadata.projectRef, 'projectalpha');
  assert.equal(direct.safeMetadata.connectionMode, 'direct');

  const pooler = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: poolerUrl('projectalpha'),
      SUPABASE_URL: 'https://projectalpha.supabase.co',
    },
  });
  assert.equal(pooler.safeMetadata.projectRef, 'projectalpha');
  assert.equal(pooler.safeMetadata.connectionMode, 'transaction');

  const sessionPooler = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: poolerUrl('projectalpha', 5432),
      SUPABASE_URL: 'https://projectalpha.supabase.co',
    },
  });
  assert.equal(sessionPooler.safeMetadata.connectionMode, 'session');

  const custom = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://app:LocalOnly-9x%21@postgres.internal:6432/app',
    },
  });
  assert.equal(custom.safeMetadata.connectionMode, 'custom');

  assert.throws(
    () => createDatabaseConfig({
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: poolerUrl('projectalpha'),
        SUPABASE_URL: 'https://projectbeta.supabase.co',
      },
    }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'SUPABASE_PROJECT_MISMATCH'
  );
});

test('runtime and Knex receive the same validated SSL, pool, and timeout settings', () => {
  const config = createDatabaseConfig({
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: directUrl(),
      SUPABASE_URL: 'https://projectalpha.supabase.co',
      DB_POOL_MIN: '1',
      DB_POOL_MAX: '14',
      DB_CONNECTION_TIMEOUT_MS: '7000',
      DB_IDLE_TIMEOUT_MS: '45000',
      DB_QUERY_TIMEOUT_MS: '12000',
      DB_STATEMENT_TIMEOUT_MS: '11000',
    },
  });

  assert.deepEqual(config.pgPoolConfig.ssl, config.knexConnectionConfig.ssl);
  assert.equal(config.pgPoolConfig.max, config.knexPoolConfig.max);
  assert.equal(config.pgPoolConfig.min, config.knexPoolConfig.min);
  assert.equal(config.pgPoolConfig.connectionTimeoutMillis, config.knexPoolConfig.acquireTimeoutMillis);
  assert.equal(config.pgPoolConfig.idleTimeoutMillis, config.knexPoolConfig.idleTimeoutMillis);
  assert.equal(config.pgPoolConfig.query_timeout, config.knexConnectionConfig.query_timeout);
  assert.equal(config.pgPoolConfig.statement_timeout, config.knexConnectionConfig.statement_timeout);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test('SSL modes are validated and Supabase cannot disable TLS', () => {
  assert.throws(
    () => parseDatabaseUrl(`${directUrl()}?sslmode=unsupported`),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'DATABASE_SSL_MODE_INVALID'
  );
  assert.throws(
    () => createDatabaseConfig({
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: `${directUrl()}?sslmode=disable`,
        SUPABASE_URL: 'https://projectalpha.supabase.co',
      },
    }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'DATABASE_SSL_REQUIRED'
  );
  assert.throws(
    () => createDatabaseConfig({
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: directUrl(),
        DB_SSL_MODE: 'invalid-mode',
      },
    }),
    (error) => error instanceof DatabaseConfigurationError && error.code === 'DATABASE_SSL_MODE_INVALID'
  );

  const customWithoutTls = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://app:LocalOnly-9x%21@127.0.0.1:5432/app',
      DB_SSL_MODE: 'disable',
    },
  });
  assert.equal(customWithoutTls.ssl, false);
  assert.equal(customWithoutTls.safeMetadata.ssl.mode, 'disable');
});

test('safe metadata reports origin and endpoint shape without credentials or full URLs', () => {
  const config = createDatabaseConfig({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: poolerUrl(),
      SUPABASE_URL: 'https://projectalpha.supabase.co',
    },
    sources: { DATABASE_URL: BACKEND_ENV_SOURCE },
    environmentFile: 'backend/.env',
    envFilePresent: true,
  });
  const serialized = JSON.stringify(config.safeMetadata);

  assert.equal(config.safeMetadata.connectionSource, BACKEND_ENV_SOURCE);
  assert.equal(config.safeMetadata.connectionVariable, 'DATABASE_URL');
  assert.equal(config.safeMetadata.environmentFile, 'backend/.env');
  assert.equal(config.safeMetadata.envFilePresent, true);
  assert.equal(config.safeMetadata.host, 'aws-1-ap-southeast-1.pooler.supabase.com');
  assert.equal(config.safeMetadata.port, 6543);
  assert.equal(config.safeMetadata.database, 'postgres');
  assert.equal(serialized.includes('LocalOnly'), false);
  assert.equal(serialized.includes('connectionString'), false);
  assert.equal(serialized.includes('username'), false);
});

test('config honors a process-labelled test database override without using live aliases', () => {
  const config = createDatabaseConfig({
    env: {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgresql://test_runner:NoLiveDb-9x%21@127.0.0.1:1/test_config',
      SUPABASE_DB_URL: '',
      DATABASE_URL: directUrl(),
    },
    sources: { TEST_DATABASE_URL: PROCESS_ENV_SOURCE },
    envFilePresent: false,
  });
  assert.equal(config.connectionVariable, 'TEST_DATABASE_URL');
  assert.equal(config.connectionSource, PROCESS_ENV_SOURCE);
  assert.equal(config.safeMetadata.host, '127.0.0.1');
  assert.equal(config.safeMetadata.envFilePresent, false);
});

test('database errors are classified and sanitized without raw details', () => {
  const rawError = Object.assign(
    new Error('connect ECONNREFUSED db.internal.example with password SuperSecret'),
    { code: 'ECONNREFUSED', detail: 'SELECT * FROM private_table' }
  );
  const sanitized = sanitizeDatabaseError(rawError);

  assert.equal(classifyDatabaseError(rawError), 'DB_CONNECTION_REFUSED');
  assert.equal(isDatabaseUnavailableError(rawError), true);
  assert.deepEqual(sanitized, {
    code: 'DB_CONNECTION_REFUSED',
    message: 'Database connection was refused.',
    retryable: true,
  });
  assert.equal(JSON.stringify(sanitized).includes('SuperSecret'), false);
  assert.equal(JSON.stringify(sanitized).includes('private_table'), false);
  assert.equal(classifyDatabaseError({ code: '42P01' }), 'DB_SCHEMA_NOT_READY');
  assert.equal(classifyDatabaseError({ code: '42501' }), 'DB_PERMISSION_DENIED');
  const missingTenant = { code: 'XX000', message: 'Tenant or user not found' };
  assert.equal(classifyDatabaseError(missingTenant), 'DB_TENANT_NOT_FOUND');
  assert.equal(isDatabaseUnavailableError(missingTenant), true);
  assert.deepEqual(sanitizeDatabaseError(missingTenant), {
    code: 'DB_TENANT_NOT_FOUND',
    message: 'Configured database tenant was not found.',
    retryable: false,
  });
  assert.equal(isDatabaseUnavailableError(new DatabaseConfigurationError('DB_URL_INVALID', 'unsafe')), true);
});
