const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const validatePublicEnvironment = (environment) => {
  for (const [name, value] of Object.entries(environment)) {
    if (!name.startsWith('VITE_') || !value) continue;
    const text = String(value).trim();
    let privateJwt = false;
    if (text.startsWith('eyJ')) {
      try { privateJwt = JSON.parse(atob(text.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role !== 'anon'; }
      catch { /* Other public strings are not JWT credentials. */ }
    }
    if (/(?:DATABASE_URL|SERVICE_ROLE|SESSION_SECRET|CSRF_SECRET|JWT_SECRET|TWO_FACTOR_ENCRYPTION_KEY|BACKUP_ENCRYPTION_KEY|RESEND_API_KEY|TEXTBEE_API_KEY|PAYMONGO_SECRET_KEY|PAYMONGO_WEBHOOK_SECRET|GOOGLE_CLIENT_SECRET|FACEBOOK_APP_SECRET|CLOUDINARY_API_SECRET)/i.test(name)
      || /^(?:sk_(?:test|live)_|re_|sb_secret_)/.test(text) || privateJwt) {
      throw new Error(`${name} contains a backend-only credential. Remove it from the frontend environment.`);
    }
  }
};

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
