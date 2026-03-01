const rateLimitMap = new Map();

const rateLimit = (windowMs = 60000, maxRequests = 100) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();

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

    record.count++;

    if (record.count > maxRequests) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
};

// Strict limiter for auth endpoints
export const authLimiter = rateLimit(15 * 60 * 1000, 20); // 20 per 15 min
// General API limiter
export const apiLimiter = rateLimit(60 * 1000, 100); // 100 per min
// Webhook limiter
export const webhookLimiter = rateLimit(60 * 1000, 50);

export default rateLimit;
