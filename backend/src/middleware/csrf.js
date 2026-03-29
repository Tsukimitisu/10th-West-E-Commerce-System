import crypto from 'crypto';

const tokens = new Map();
const getCsrfScope = (req) => req.sessionID || req.headers['x-session-id'] || req.ip;

export const generateCsrfToken = (req, res, next) => {
  const token = crypto.randomBytes(32).toString('hex');
  const scope = getCsrfScope(req);
  tokens.set(scope, { token, expires: Date.now() + 3600000 });
  res.cookie('csrf-token', token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  req.csrfToken = token;
  next();
};

export const validateCsrf = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip for API calls with Bearer token (already authenticated)
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) return next();

  const token = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || req.body?._csrf;
  const scope = getCsrfScope(req);
  const stored = tokens.get(scope);

  if (!stored || stored.token !== token || Date.now() > stored.expires) {
    return res.status(403).json({
      message: 'Invalid CSRF token',
      code: 'CSRF_INVALID_TOKEN',
    });
  }

  next();
};
