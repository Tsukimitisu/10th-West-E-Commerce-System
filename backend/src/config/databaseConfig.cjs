'use strict';

const net = require('node:net');
const {
  BACKEND_ENV_LABEL,
  loadedBackendEnvironment,
} = require('./environment.cjs');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const DEFAULT_POSTGRES_PORT = 5432;
const VALID_SSL_MODES = new Set([
  'disable',
  'allow',
  'prefer',
  'require',
  'no-verify',
  'verify-ca',
  'verify-full',
]);

const PLACEHOLDER_PATTERNS = [
  /\[(?:your|project|password|user|host|database)[^\]]*\]/i,
  /<(?:your|project|password|user|host|database)[^>]*>/i,
  /(?:^|[^a-z0-9])(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:password|project|user|host|database|value))(?:$|[^a-z0-9])/i,
];

class DatabaseConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DatabaseConfigurationError';
    this.code = code;
  }
}

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const containsPlaceholder = (value) => {
  const text = String(value || '').trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
};

const decodeUrlComponent = (value, code) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DatabaseConfigurationError(code, 'The database URL contains invalid encoding.');
  }
};

const isValidDatabaseHost = (host) => {
  const unwrapped = String(host || '').replace(/^\[|\]$/g, '');
  if (net.isIP(unwrapped)) return true;
  if (unwrapped.length > 253) return false;
  return unwrapped.split('.').every((label) => (
    label.length > 0
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
};

const parseDatabaseUrl = (connectionString) => {
  const raw = String(connectionString || '').trim();
  if (!raw) {
    throw new DatabaseConfigurationError(
      'DATABASE_URL_MISSING',
      'A PostgreSQL connection URL is required.'
    );
  }
  if (containsPlaceholder(raw)) {
    throw new DatabaseConfigurationError(
      'DB_URL_PLACEHOLDER',
      'The database URL still contains a placeholder.'
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DatabaseConfigurationError('DB_URL_INVALID', 'The database URL is invalid.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new DatabaseConfigurationError(
      'DB_URL_PROTOCOL_INVALID',
      'The database URL must use the postgres or postgresql protocol.'
    );
  }
  if (!parsed.hostname || containsPlaceholder(parsed.hostname) || !isValidDatabaseHost(parsed.hostname)) {
    throw new DatabaseConfigurationError('DATABASE_HOST_INVALID', 'The database URL host is invalid.');
  }

  const port = parsed.port ? Number(parsed.port) : DEFAULT_POSTGRES_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DatabaseConfigurationError('DB_URL_PORT_INVALID', 'The database URL port is invalid.');
  }

  const database = decodeUrlComponent(parsed.pathname.replace(/^\/+/, ''), 'DB_URL_DATABASE_INVALID');
  const username = decodeUrlComponent(parsed.username, 'DB_URL_USERNAME_INVALID');
  const password = decodeUrlComponent(parsed.password, 'DB_URL_PASSWORD_INVALID');

  if (!database || database.includes('/') || containsPlaceholder(database)) {
    throw new DatabaseConfigurationError(
      'DB_URL_DATABASE_INVALID',
      'The database URL must include a valid database name.'
    );
  }
  if (!username || containsPlaceholder(username)) {
    throw new DatabaseConfigurationError(
      'DB_URL_USERNAME_INVALID',
      'The database URL must include a valid username.'
    );
  }
  if (!password || containsPlaceholder(password)) {
    throw new DatabaseConfigurationError(
      'DB_URL_PASSWORD_INVALID',
      'The database URL must include a valid password.'
    );
  }

  const sslMode = String(parsed.searchParams.get('sslmode') || '').trim().toLowerCase() || null;
  if (sslMode && !VALID_SSL_MODES.has(sslMode)) {
    throw new DatabaseConfigurationError(
      'DATABASE_SSL_MODE_INVALID',
      'The database URL contains an unsupported sslmode.'
    );
  }

  return {
    raw,
    protocol: parsed.protocol.slice(0, -1),
    host: parsed.hostname.toLowerCase(),
    port,
    database,
    username,
    passwordPresent: true,
    sslMode,
  };
};

const parseSupabaseProjectRef = (supabaseUrl) => {
  const raw = String(supabaseUrl || '').trim();
  if (!raw) return null;
  if (containsPlaceholder(raw)) {
    throw new DatabaseConfigurationError(
      'SUPABASE_URL_PLACEHOLDER',
      'The Supabase URL still contains a placeholder.'
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DatabaseConfigurationError('SUPABASE_URL_INVALID', 'The Supabase URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new DatabaseConfigurationError('SUPABASE_URL_INVALID', 'The Supabase URL is invalid.');
  }

  return parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1] || null;
};

const inferDatabaseProjectRef = ({ host, username }) => {
  const directRef = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1] || null;
  const poolerRef = username.match(/^postgres\.([a-z0-9-]+)$/i)?.[1] || null;

  if (directRef && poolerRef && directRef !== poolerRef) {
    throw new DatabaseConfigurationError(
      'SUPABASE_PROJECT_MISMATCH',
      'The database host and pooler username refer to different Supabase projects.'
    );
  }

  return directRef || poolerRef;
};

const getConnectionMode = ({ host, port }) => {
  if (/^db\.[a-z0-9-]+\.supabase\.co$/i.test(host)) return 'direct';
  if (/\.pooler\.supabase\.com$/i.test(host)) {
    if (port === 5432) return 'session';
    if (port === 6543) return 'transaction';
  }
  return 'custom';
};

const resolveSslConfig = ({ env, urlSslMode, nodeEnv, isSupabase }) => {
  const configuredMode = String(env.DB_SSL_MODE || '').trim().toLowerCase();
  if (configuredMode && !VALID_SSL_MODES.has(configuredMode)) {
    throw new DatabaseConfigurationError(
      'DATABASE_SSL_MODE_INVALID',
      'DB_SSL_MODE contains an unsupported value.'
    );
  }

  const mode = configuredMode || urlSslMode || (nodeEnv === 'production' ? 'verify-full' : 'require');
  if (isSupabase && mode === 'disable') {
    throw new DatabaseConfigurationError(
      'DATABASE_SSL_REQUIRED',
      'Supabase database connections require TLS.'
    );
  }

  const enabled = mode !== 'disable';
  const rejectUnauthorized = enabled
    && (nodeEnv === 'production' || mode === 'verify-ca' || mode === 'verify-full');

  return {
    mode,
    enabled,
    rejectUnauthorized,
    value: enabled ? deepFreeze({ rejectUnauthorized }) : false,
  };
};

const selectDatabaseUrl = ({ env, sources = {} }) => {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const supabaseDbUrl = String(env.SUPABASE_DB_URL || '').trim();
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (supabaseDbUrl && databaseUrl && supabaseDbUrl !== databaseUrl) {
    throw new DatabaseConfigurationError(
      'DATABASE_URL_CONFLICT',
      'SUPABASE_DB_URL and DATABASE_URL must not point to different databases.'
    );
  }
  const candidates = [];

  if (nodeEnv === 'test') {
    const testDatabaseUrl = String(env.TEST_DATABASE_URL || '').trim();
    if (!testDatabaseUrl) {
      throw new DatabaseConfigurationError(
        'TEST_DATABASE_URL_MISSING',
        'NODE_ENV=test requires an explicit TEST_DATABASE_URL.'
      );
    }
    candidates.push('TEST_DATABASE_URL');
  }
  candidates.push('SUPABASE_DB_URL', 'DATABASE_URL');

  for (const variable of candidates) {
    const value = String(env[variable] || '').trim();
    if (!value) continue;
    return {
      nodeEnv,
      variable,
      value,
      source: sources[variable] || (hasOwn(env, variable) ? 'process.env' : 'unknown'),
    };
  }

  throw new DatabaseConfigurationError(
    'DATABASE_URL_MISSING',
    nodeEnv === 'test'
      ? 'Set TEST_DATABASE_URL, SUPABASE_DB_URL, or DATABASE_URL for database access.'
      : 'Set SUPABASE_DB_URL or DATABASE_URL for database access.'
  );
};

const parseIntegerSetting = ({ env, name, fallback, min, max }) => {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new DatabaseConfigurationError(
      'DB_SETTING_INVALID',
      `The ${name} database setting must be an integer.`
    );
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new DatabaseConfigurationError(
      'DB_SETTING_OUT_OF_RANGE',
      `The ${name} database setting is outside the supported range.`
    );
  }
  return parsed;
};

const createDatabaseConfig = ({
  env = loadedBackendEnvironment.env,
  sources = loadedBackendEnvironment.sources,
  environmentFile = BACKEND_ENV_LABEL,
  envFilePresent = loadedBackendEnvironment.envFilePresent,
} = {}) => {
  const selected = selectDatabaseUrl({ env, sources });
  const parsed = parseDatabaseUrl(selected.value);
  const databaseProjectRef = inferDatabaseProjectRef(parsed);
  const supabaseProjectRef = parseSupabaseProjectRef(env.SUPABASE_URL);
  const connectionMode = getConnectionMode(parsed);
  const isSupabase = Boolean(databaseProjectRef)
    || /(?:\.supabase\.co|\.pooler\.supabase\.com)$/i.test(parsed.host);

  if (databaseProjectRef && supabaseProjectRef && databaseProjectRef !== supabaseProjectRef) {
    throw new DatabaseConfigurationError(
      'SUPABASE_PROJECT_MISMATCH',
      'The PostgreSQL and Supabase URLs refer to different projects.'
    );
  }

  const poolMin = parseIntegerSetting({ env, name: 'DB_POOL_MIN', fallback: 0, min: 0, max: 100 });
  const poolMax = parseIntegerSetting({ env, name: 'DB_POOL_MAX', fallback: 10, min: 1, max: 100 });
  if (poolMin > poolMax) {
    throw new DatabaseConfigurationError(
      'DB_POOL_RANGE_INVALID',
      'DB_POOL_MIN cannot be greater than DB_POOL_MAX.'
    );
  }

  const connectionTimeoutMillis = parseIntegerSetting({
    env,
    name: 'DB_CONNECTION_TIMEOUT_MS',
    fallback: 5000,
    min: 1,
    max: 600000,
  });
  const idleTimeoutMillis = parseIntegerSetting({
    env,
    name: 'DB_IDLE_TIMEOUT_MS',
    fallback: 30000,
    min: 1,
    max: 3600000,
  });
  const queryTimeoutMillis = parseIntegerSetting({
    env,
    name: 'DB_QUERY_TIMEOUT_MS',
    fallback: 10000,
    min: 1,
    max: 600000,
  });
  const statementTimeoutMillis = parseIntegerSetting({
    env,
    name: 'DB_STATEMENT_TIMEOUT_MS',
    fallback: 10000,
    min: 1,
    max: 600000,
  });

  const sslConfig = resolveSslConfig({
    env,
    urlSslMode: parsed.sslMode,
    nodeEnv: selected.nodeEnv,
    isSupabase,
  });
  const ssl = sslConfig.value;
  const pgPoolConfig = deepFreeze({
    connectionString: selected.value,
    min: poolMin,
    max: poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    query_timeout: queryTimeoutMillis,
    statement_timeout: statementTimeoutMillis,
    ssl,
  });
  const knexConnectionConfig = deepFreeze({
    connectionString: selected.value,
    connectionTimeoutMillis,
    query_timeout: queryTimeoutMillis,
    statement_timeout: statementTimeoutMillis,
    ssl,
  });
  const knexPoolConfig = deepFreeze({
    min: poolMin,
    max: poolMax,
    acquireTimeoutMillis: connectionTimeoutMillis,
    idleTimeoutMillis,
  });
  const safeMetadata = deepFreeze({
    environmentFile,
    envFilePresent: Boolean(envFilePresent),
    environment: selected.nodeEnv,
    connectionVariable: selected.variable,
    connectionSource: selected.source,
    protocol: parsed.protocol,
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    projectRef: databaseProjectRef || supabaseProjectRef || null,
    connectionMode,
    userPresent: true,
    passwordPresent: parsed.passwordPresent,
    ssl: {
      mode: sslConfig.mode,
      enabled: sslConfig.enabled,
      rejectUnauthorized: sslConfig.rejectUnauthorized,
    },
    pool: {
      min: poolMin,
      max: poolMax,
      connectionTimeoutMillis,
      idleTimeoutMillis,
      queryTimeoutMillis,
      statementTimeoutMillis,
    },
  });

  return deepFreeze({
    nodeEnv: selected.nodeEnv,
    connectionVariable: selected.variable,
    connectionSource: selected.source,
    connectionString: selected.value,
    ssl,
    pgPoolConfig,
    knexConnectionConfig,
    knexPoolConfig,
    acquireConnectionTimeout: connectionTimeoutMillis,
    safeMetadata,
  });
};

const ERROR_DETAILS = Object.freeze({
  DB_DNS_ERROR: { message: 'Database hostname resolution failed.', retryable: true },
  DB_CONNECTION_REFUSED: { message: 'Database connection was refused.', retryable: true },
  DB_CONNECTION_RESET: { message: 'Database connection was interrupted.', retryable: true },
  DB_TIMEOUT: { message: 'Database operation timed out.', retryable: true },
  DB_TLS_ERROR: { message: 'Database TLS negotiation failed.', retryable: false },
  DB_AUTHENTICATION_FAILED: { message: 'Database authentication failed.', retryable: false },
  DB_TENANT_NOT_FOUND: { message: 'Configured database tenant was not found.', retryable: false },
  DB_DATABASE_NOT_FOUND: { message: 'Configured database was not found.', retryable: false },
  DB_CAPACITY_EXCEEDED: { message: 'Database connection capacity is exhausted.', retryable: true },
  DB_UNAVAILABLE: { message: 'Database service is unavailable.', retryable: true },
  DB_SCHEMA_NOT_READY: { message: 'Database schema is not ready.', retryable: false },
  DB_PERMISSION_DENIED: { message: 'Database operation was not permitted.', retryable: false },
  DB_QUERY_CANCELLED: { message: 'Database operation was cancelled.', retryable: true },
  DB_CONFIG_INVALID: { message: 'Database configuration is invalid.', retryable: false },
  DB_ERROR: { message: 'Database operation failed.', retryable: false },
});

const classifyDatabaseError = (error) => {
  if (error instanceof DatabaseConfigurationError || error?.name === 'DatabaseConfigurationError') {
    return 'DB_CONFIG_INVALID';
  }

  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DB_DNS_ERROR';
  if (code === 'ECONNREFUSED') return 'DB_CONNECTION_REFUSED';
  if (['ECONNRESET', 'EPIPE'].includes(code)) return 'DB_CONNECTION_RESET';
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) || message.includes('timeout')) return 'DB_TIMEOUT';
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)
      || message.includes('tls') || message.includes('certificate')) return 'DB_TLS_ERROR';
  if (message.includes('tenant or user not found') || message.includes('tenant not found')) {
    return 'DB_TENANT_NOT_FOUND';
  }
  if (['28P01', '28000'].includes(code)) return 'DB_AUTHENTICATION_FAILED';
  if (code === '3D000') return 'DB_DATABASE_NOT_FOUND';
  if (code === '53300') return 'DB_CAPACITY_EXCEEDED';
  if (code.startsWith('08') || ['57P01', '57P02', '57P03'].includes(code)
      || message.includes('connection terminated')) return 'DB_UNAVAILABLE';
  if (['42P01', '42703'].includes(code)) return 'DB_SCHEMA_NOT_READY';
  if (code === '42501') return 'DB_PERMISSION_DENIED';
  if (code === '57014') return 'DB_QUERY_CANCELLED';
  return 'DB_ERROR';
};

const UNAVAILABLE_ERROR_CODES = new Set([
  'DB_DNS_ERROR',
  'DB_CONNECTION_REFUSED',
  'DB_CONNECTION_RESET',
  'DB_TIMEOUT',
  'DB_TLS_ERROR',
  'DB_AUTHENTICATION_FAILED',
  'DB_TENANT_NOT_FOUND',
  'DB_DATABASE_NOT_FOUND',
  'DB_CAPACITY_EXCEEDED',
  'DB_UNAVAILABLE',
  'DB_SCHEMA_NOT_READY',
  'DB_CONFIG_INVALID',
]);

const isDatabaseUnavailableError = (error) => UNAVAILABLE_ERROR_CODES.has(classifyDatabaseError(error));

const sanitizeDatabaseError = (error) => {
  const code = classifyDatabaseError(error);
  return {
    code,
    ...ERROR_DETAILS[code],
  };
};

let cachedDatabaseConfig;
const getDatabaseConfig = (options) => {
  if (options) return createDatabaseConfig(options);
  if (!cachedDatabaseConfig) cachedDatabaseConfig = createDatabaseConfig();
  return cachedDatabaseConfig;
};

module.exports = {
  DatabaseConfigurationError,
  containsPlaceholder,
  isValidDatabaseHost,
  parseDatabaseUrl,
  parseSupabaseProjectRef,
  inferDatabaseProjectRef,
  getConnectionMode,
  resolveSslConfig,
  selectDatabaseUrl,
  createDatabaseConfig,
  getDatabaseConfig,
  classifyDatabaseError,
  isDatabaseUnavailableError,
  sanitizeDatabaseError,
};
