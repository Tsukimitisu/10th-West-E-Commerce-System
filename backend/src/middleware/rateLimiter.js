const rateLimitMap = new Map();

const defaultKeyGenerator = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${req.method}:${req.baseUrl || ''}${req.path}:${ip}`;
};

const normalizeIdentifier = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const rateLimit = (windowMs = 60000, maxRequests = 100, options = {}) => {
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req);

    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = rateLimitMap.get(key);

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count += 1;

    if (record.count > maxRequests) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
};

const authKeyByEmail = (action) => (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const email = normalizeIdentifier(req.body?.email);
  return `${action}:${ip}:${email}`;
};

// Strict limiter for auth endpoints
export const authLimiter = rateLimit(15 * 60 * 1000, 50);
// Resend Verification limiter
export const resendVerificationLimiter = rateLimit(5 * 60 * 1000, 3, {
  keyGenerator: authKeyByEmail('resend-verification'),
});
// Registration limiter
export const registerLimiter = rateLimit(15 * 60 * 1000, 5, {
  keyGenerator: authKeyByEmail('register'),
});
// Login limiter
export const loginLimiter = rateLimit(5 * 60 * 1000, 10, {
  keyGenerator: authKeyByEmail('login'),
});
// General API limiter
export const apiLimiter = rateLimit(60 * 1000, 100);
// Webhook limiter
export const webhookLimiter = rateLimit(60 * 1000, 50);

export default rateLimit;
