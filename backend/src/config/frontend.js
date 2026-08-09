const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';

const normalizeOrigin = (value) => {
  const parsed = new URL(String(value || '').trim());
  return parsed.origin;
};

export const resolveFrontendOrigin = (environment = process.env) => normalizeOrigin(
  environment.FRONTEND_ORIGIN || environment.FRONTEND_URL || DEFAULT_FRONTEND_ORIGIN
);

export const resolveAllowedFrontendOrigins = (environment = process.env) => {
  const configured = [
    environment.FRONTEND_ORIGIN,
    environment.FRONTEND_URL,
    ...String(environment.CORS_ALLOWED_ORIGINS || '').split(','),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (configured.length === 0) configured.push(DEFAULT_FRONTEND_ORIGIN);
  return [...new Set(configured)];
};
