// Pure validation: never include environment values in error messages.
export const isLocalHostname = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1'
    || host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
};

export const publicUrl = (value, name, originOnly = false) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || isLocalHostname(url.hostname) || url.username || url.password
      || (originOnly && (url.pathname !== '/' || url.search || url.hash))) throw new Error();
    return url;
  } catch {
    throw new Error(`${name} must be a public HTTPS ${originOnly ? 'origin' : 'URL'} without credentials.`);
  }
};

export const validateDeploymentUrls = (env) => {
  if (String(env.NODE_ENV).toLowerCase() !== 'production') return;
  const frontend = publicUrl(env.FRONTEND_ORIGIN || env.FRONTEND_URL, 'FRONTEND_ORIGIN', true);
  const backend = publicUrl(env.BACKEND_URL, 'BACKEND_URL', true);
  if (env.FRONTEND_URL && publicUrl(env.FRONTEND_URL, 'FRONTEND_URL', true).origin !== frontend.origin) {
    throw new Error('FRONTEND_URL and FRONTEND_ORIGIN must identify the same production frontend.');
  }
  for (const provider of ['GOOGLE', 'FACEBOOK']) {
    const value = env[`${provider}_CALLBACK_URL`];
    if (!value) continue;
    const callback = publicUrl(value, `${provider}_CALLBACK_URL`);
    if (callback.origin !== backend.origin || callback.pathname !== `/api/auth/${provider.toLowerCase()}/callback`
      || callback.search || callback.hash) throw new Error(`${provider}_CALLBACK_URL must match BACKEND_URL and its auth callback path.`);
  }
  for (const name of ['PUBLIC_APP_URL', 'PAYMONGO_SUCCESS_URL', 'PAYMONGO_FAILED_URL', 'PAYMONGO_CANCEL_URL']) {
    if (env[name] && publicUrl(env[name], name).origin !== frontend.origin) {
      throw new Error(`${name} must use the production frontend origin.`);
    }
  }
  if (env.PAYMONGO_API_BASE_URL && env.PAYMONGO_API_BASE_URL.replace(/\/+$/, '') !== 'https://api.paymongo.com/v1') {
    throw new Error('PAYMONGO_API_BASE_URL must use the official HTTPS API.');
  }
  const mode = env.PAYMONGO_MODE || (env.PAYMONGO_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test');
  if (!['test', 'live'].includes(mode)) throw new Error('PAYMONGO_MODE must be test or live.');
  for (const [name, prefix] of [['PAYMONGO_SECRET_KEY', 'sk'], ['PAYMONGO_PUBLIC_KEY', 'pk']]) {
    if (env[name] && !env[name].startsWith(`${prefix}_${mode}_`)) throw new Error(`${name} must match PAYMONGO_MODE.`);
  }
  if (/^(true|1|yes)$/i.test(env.OTP_DEBUG_LOG_CODE || '')) throw new Error('OTP_DEBUG_LOG_CODE must be false in production.');
};
