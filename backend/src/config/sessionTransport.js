// Render terminates HTTPS before forwarding to Node. Express and the session
// middleware must agree about that trusted proxy, including during preview runs.
export const resolveSessionTransport = (env = process.env) => {
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const render = String(env.RENDER || '').trim().toLowerCase() === 'true';
  const hosted = production || render;
  const configuredSameSite = String(env.COOKIE_SAME_SITE || env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(configuredSameSite) ? configuredSameSite : hosted ? 'none' : 'lax';
  const configuredSecure = String(env.COOKIE_SECURE || '').trim().toLowerCase();
  const secure = hosted || sameSite === 'none' || ['true', '1', 'yes'].includes(configuredSecure);
  return {
    trustProxy: hosted ? 1 : 0,
    cookie: { secure, httpOnly: true, sameSite, path: '/' },
    render,
    production,
  };
};

export const describeSessionTransport = ({ transport, req, allowedOrigins, postgres }) => ({
  environment: transport.production ? 'production' : 'development',
  render: transport.render,
  origin_allowed: Boolean(req.headers.origin && allowedOrigins.includes(req.headers.origin)),
  frontend_origins: allowedOrigins,
  cookie: transport.cookie,
  trust_proxy: transport.trustProxy,
  request_secure: Boolean(req.secure),
  session_store: postgres ? 'postgres' : 'memory',
  session_cookie_present: /(?:^|;\s*)twm\.sid=/.test(req.headers.cookie || ''),
});
