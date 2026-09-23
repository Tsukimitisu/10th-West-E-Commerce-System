const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const normalizeApiUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

export const validateProductionApiUrl = (value) => {
  const normalized = normalizeApiUrl(value);
  if (!normalized) {
    throw new Error('VITE_API_URL is required for production builds. Set it to the public backend URL ending in /api.');
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('VITE_API_URL must be an absolute HTTPS URL ending in /api.');
  }

  if (
    parsed.protocol !== 'https:'
    || LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname.replace(/\/+$/, '') !== '/api'
  ) {
    throw new Error('VITE_API_URL must be a public HTTPS URL without credentials, query parameters, or fragments, and its path must end in /api.');
  }

  return normalized;
};
