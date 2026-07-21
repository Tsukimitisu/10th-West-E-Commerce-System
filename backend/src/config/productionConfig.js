const SECRET_NAMES = Object.freeze([
  'JWT_SECRET',
  'SESSION_SECRET',
  'CSRF_SECRET',
  'TWO_FACTOR_ENCRYPTION_KEY',
]);

const PLACEHOLDER_PATTERN = /(?:change[-_ ]?this|replace[-_ ]?with|your[-_ ]|placeholder|example|changeme|secret[-_ ]?key|\[[^\]]+\])/i;

export class ProductionConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionConfigurationError';
    this.code = code;
  }
}

export const normalizeNodeEnvironment = (value) => String(value || 'development').trim().toLowerCase();

const requireValue = (environment, name) => {
  const value = String(environment[name] || '').trim();
  if (!value) {
    throw new ProductionConfigurationError(
      'PRODUCTION_ENV_MISSING',
      `Missing required production environment variable: ${name}.`
    );
  }
  return value;
};

const validateSecret = (environment, name) => {
  const value = requireValue(environment, name);
  if (value.length < 32 || PLACEHOLDER_PATTERN.test(value)) {
    throw new ProductionConfigurationError(
      'PRODUCTION_SECRET_INVALID',
      `${name} must be a non-placeholder secret containing at least 32 characters.`
    );
  }
  return value;
};

const validateHttpsOrigin = (value, { code, label }) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProductionConfigurationError(
      code,
      `${label} must contain absolute HTTPS origins.`
    );
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new ProductionConfigurationError(
      code,
      `${label} must contain HTTPS origins without credentials, paths, queries, or fragments.`
    );
  }
  return url.origin;
};

const validateFrontendOrigin = (environment) => validateHttpsOrigin(
  requireValue(environment, 'FRONTEND_ORIGIN'),
  { code: 'PRODUCTION_FRONTEND_ORIGIN_INVALID', label: 'FRONTEND_ORIGIN' },
);

const validateCorsAllowedOrigins = (environment) => {
  const values = String(environment.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values.map((value) => validateHttpsOrigin(value, {
    code: 'PRODUCTION_CORS_ORIGINS_INVALID',
    label: 'CORS_ALLOWED_ORIGINS',
  })))];
};

export const validateCoreEnvironment = (environment = process.env) => {
  const nodeEnvironment = normalizeNodeEnvironment(environment.NODE_ENV);
  const jwtSecret = String(environment.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new ProductionConfigurationError(
      'CORE_ENV_MISSING',
      'Missing required core environment variable: JWT_SECRET.'
    );
  }

  if (nodeEnvironment !== 'production') {
    return { isProduction: false, nodeEnvironment };
  }

  const secrets = SECRET_NAMES.map((name) => [name, validateSecret(environment, name)]);
  if (new Set(secrets.map(([, value]) => value)).size !== secrets.length) {
    throw new ProductionConfigurationError(
      'PRODUCTION_SECRETS_REUSED',
      'JWT_SECRET, SESSION_SECRET, CSRF_SECRET, and TWO_FACTOR_ENCRYPTION_KEY must be unique.'
    );
  }

  if (requireValue(environment, 'SESSION_STORE').toLowerCase() !== 'postgres') {
    throw new ProductionConfigurationError(
      'PRODUCTION_SESSION_STORE_INVALID',
      'SESSION_STORE must be postgres in production.'
    );
  }
  if (requireValue(environment, 'COOKIE_SECURE').toLowerCase() !== 'true') {
    throw new ProductionConfigurationError(
      'PRODUCTION_COOKIE_SECURE_REQUIRED',
      'COOKIE_SECURE must be true in production.'
    );
  }
  const sameSite = requireValue(environment, 'COOKIE_SAME_SITE').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new ProductionConfigurationError(
      'PRODUCTION_COOKIE_SAMESITE_INVALID',
      'COOKIE_SAME_SITE must be lax, strict, or none.'
    );
  }

  for (const providerName of ['SHIPPING_PROVIDER', 'TRACKING_PROVIDER']) {
    if (String(environment[providerName] || '').trim().toLowerCase() === 'mock') {
      throw new ProductionConfigurationError(
        'PRODUCTION_MOCK_PROVIDER_BLOCKED',
        `${providerName}=mock is not allowed in production.`
      );
    }
  }

  return {
    isProduction: true,
    nodeEnvironment,
    frontendOrigin: validateFrontendOrigin(environment),
    corsAllowedOrigins: validateCorsAllowedOrigins(environment),
    cookieSameSite: sameSite,
  };
};
