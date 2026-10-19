import { canonicalPhone } from '../services/phoneOtp.js';
import pool from '../config/database.js';
import databaseConfig from '../config/databaseConfig.cjs';
import { createHash } from 'node:crypto';

const { isDatabaseUnavailableError, sanitizeDatabaseError } = databaseConfig;
const DATABASE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

const rateLimitMap = new Map();

const maybeCleanupMemoryLimiter = (now) => {
  if (rateLimitMap.size === 0) return;

  if (Math.random() < 0.02) {
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime + (5 * 60 * 1000)) {
        rateLimitMap.delete(key);
      }
    }
  }
};

const getMemoryRateLimitRecord = (key, now, windowMs) => {
  const existing = rateLimitMap.get(key);

  if (!existing || now > existing.resetTime) {
    const nextRecord = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(key, nextRecord);
    return nextRecord;
  }

  existing.count += 1;
  return existing;
};

const getDbRateLimitRecord = async (key, windowMs) => {
  const result = await pool.query(
    `INSERT INTO request_rate_limits (key, request_count, reset_at, updated_at)
     VALUES ($1, 1, NOW() + ($2::bigint * INTERVAL '1 millisecond'), NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       request_count = CASE
         WHEN request_rate_limits.reset_at <= NOW() THEN 1
         ELSE request_rate_limits.request_count + 1
       END,
       reset_at = CASE
         WHEN request_rate_limits.reset_at <= NOW() THEN NOW() + ($2::bigint * INTERVAL '1 millisecond')
         ELSE request_rate_limits.reset_at
       END,
       updated_at = NOW()
     RETURNING request_count,
               GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - NOW()))))::int AS retry_after_seconds`,
    [key, windowMs]
  );

  if (Math.random() < 0.01) {
    await pool.query(
      `DELETE FROM request_rate_limits
       WHERE reset_at < NOW() - INTERVAL '1 hour'`
    ).catch(() => {});
  }

  const row = result.rows[0] || { request_count: 1, retry_after_seconds: Math.ceil(windowMs / 1000) };
  return {
    count: Number(row.request_count) || 1,
    retryAfterSeconds: Number(row.retry_after_seconds) || Math.ceil(windowMs / 1000),
  };
};

const defaultKeyGenerator = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${req.method}:${req.baseUrl || ''}${req.path}:${ip}`;
};

const namespaceRateLimitKey = (key) => {
  const namespace = String(process.env.RATE_LIMIT_NAMESPACE || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 64);
  // Limiter keys can contain emails or reset tokens. Persist only a digest.
  const digest = createHash('sha256').update(String(key)).digest('hex');
  return namespace ? `${namespace}:${digest}` : digest;
};

const normalizeIdentifier = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const rateLimit = (windowMs = 60000, maxRequests = 100, options = {}) => {
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;
  const storage = options.storage || (String(process.env.NODE_ENV).trim().toLowerCase() === 'production' ? 'db' : 'memory');

  return async (req, res, next) => {
    try {
      const now = Date.now();
      const key = namespaceRateLimitKey(keyGenerator(req));
      let count = 1;
      let retryAfter = Math.ceil(windowMs / 1000);

      if (storage === 'db') {
        try {
          const dbRecord = await getDbRateLimitRecord(key, windowMs);
          count = dbRecord.count;
          retryAfter = dbRecord.retryAfterSeconds;
        } catch (dbError) {
          console.error('Rate limiter DB storage unavailable:', sanitizeDatabaseError(dbError));
          if (isDatabaseUnavailableError(dbError)) {
            return res.status(503).json({
              message: DATABASE_UNAVAILABLE_MESSAGE,
              code: 'DATABASE_UNAVAILABLE',
            });
          }
          return res.status(503).json({
            message: 'Rate limiting service is temporarily unavailable. Please try again later.',
            code: 'RATE_LIMIT_UNAVAILABLE',
          });
        }
      } else {
        maybeCleanupMemoryLimiter(now);
        const record = getMemoryRateLimitRecord(key, now, windowMs);
        count = record.count;
        retryAfter = Math.ceil((record.resetTime - now) / 1000);
      }

      if (count > maxRequests) {
        res.setHeader?.('Retry-After', String(Math.max(1, retryAfter)));
        return res.status(429).json({
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.max(1, retryAfter),
        });
      }

      return next();
    } catch (error) {
      console.error('Rate limiter failure:', sanitizeDatabaseError(error));
      return res.status(503).json({ message: 'Rate limiting service is temporarily unavailable. Please try again later.', code: 'RATE_LIMIT_UNAVAILABLE' });
    }
  };
};

export const cleanupRateLimitRecords = async () => {
  const result = await pool.query(
    `DELETE FROM request_rate_limits
     WHERE reset_at < NOW() - INTERVAL '1 hour'`
  );
  return result.rowCount || 0;
};

const authKeyByEmail = (action) => (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const email = normalizeIdentifier(req.body?.email);
  return `${action}:${ip}:${email}`;
};

// Strict limiter for auth endpoints
export const authLimiter = rateLimit(15 * 60 * 1000, 50, { storage: 'db' });
// Resend Verification limiter
export const resendVerificationLimiter = rateLimit(5 * 60 * 1000, 3, {
  keyGenerator: authKeyByEmail('resend-verification'),
  storage: 'db',
});
// Forgot password limiter
export const forgotPasswordLimiter = rateLimit(10 * 60 * 1000, 3, {
  keyGenerator: authKeyByEmail('forgot-password'),
  storage: 'db',
});
// Reset token verification limiter
export const verifyResetTokenLimiter = rateLimit(10 * 60 * 1000, 10, {
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const token = normalizeIdentifier(req.body?.token);
    return `verify-reset-token:${ip}:${token.slice(0, 32)}`;
  },
  storage: 'db',
});
// Reset password submission limiter
export const resetPasswordLimiter = rateLimit(15 * 60 * 1000, 5, {
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const token = normalizeIdentifier(req.body?.token);
    return `reset-password:${ip}:${token.slice(0, 32)}`;
  },
  storage: 'db',
});
// Registration limiter
export const registerLimiter = rateLimit(15 * 60 * 1000, 5, {
  keyGenerator: authKeyByEmail('register'),
  storage: 'db',
});
// Login limiter
export const loginLimiter = rateLimit(5 * 60 * 1000, 10, {
  keyGenerator: authKeyByEmail('login'),
  storage: 'db',
});
// Support form limiter: stricter than the general API limiter because guests can submit tickets.
export const supportLimiter = rateLimit(15 * 60 * 1000, 5, {
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const email = normalizeIdentifier(req.body?.email);
    return `support:${ip}:${email}`;
  },
  storage: 'db',
});
// General API limiter
export const apiLimiter = rateLimit(60 * 1000, 100);
// Webhook limiter
export const webhookLimiter = rateLimit(60 * 1000, 50);

const actionKey = action => req => `${action}:${req.user?.id || 'guest'}:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
const actionLimit = (action, windowMs, maximum) => rateLimit(windowMs, maximum, { storage: 'db', keyGenerator: actionKey(action) });
export const accountMutationLimiter = actionLimit('account-security', 15 * 60 * 1000, 10);
export const twoFactorLimiter = actionLimit('two-factor', 5 * 60 * 1000, 10);
export const checkoutLimiter = actionLimit('checkout', 10 * 60 * 1000, 15);
export const paymentStatusLimiter = actionLimit('payment-status', 60 * 1000, 60);
export const messageLimiter = actionLimit('messages', 60 * 1000, 30);
export const adminMutationLimiter = actionLimit('admin-mutation', 60 * 1000, 30);
export const backupCreateLimiter = actionLimit('backup-create', 60 * 60 * 1000, 3);
export const backupRestoreLimiter = actionLimit('backup-restore', 60 * 60 * 1000, 3);

export default rateLimit;

// Persisted keys are SHA-256 namespaced by rateLimit; no raw phone is stored.
const recoveryKey = action => req => `${action}:${req.ip || 'unknown'}:${canonicalPhone(req.body?.phone) || 'invalid'}`;
export const phoneRecoveryIpLimiter = rateLimit(10 * 60 * 1000, 10, { storage: 'db' });
export const phoneRecoveryLimiter = rateLimit(10 * 60 * 1000, 3, { storage: 'db', keyGenerator: recoveryKey('phone-reset') });
export const phoneRecoveryVerifyIpLimiter = rateLimit(10 * 60 * 1000, 30, { storage: 'db' });
export const phoneRecoveryVerifyLimiter = rateLimit(10 * 60 * 1000, 10, { storage: 'db', keyGenerator: recoveryKey('phone-reset-verify') });
