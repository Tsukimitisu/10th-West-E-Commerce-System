import crypto from 'crypto';

const tokens = new Map();

export const generateCsrfToken = (req, res, next) => {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = req.headers['x-session-id'] || req.ip;
  tokens.set(sessionId, { token, expires: Date.now() + 3600000 });
  res.cookie('csrf-token', token, { httpOnly: false, sameSite: 'strict' });
  req.csrfToken = token;
  next();
};

export const validateCsrf = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip for API calls with Bearer token (already authenticated)
  if (req.headers.authorization?.startsWith('Bearer')) return next();

  const token = req.headers['x-csrf-token'] || req.body?._csrf;
  const sessionId = req.headers['x-session-id'] || req.ip;
  const stored = tokens.get(sessionId);

  if (!stored || stored.token !== token || Date.now() > stored.expires) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
};
