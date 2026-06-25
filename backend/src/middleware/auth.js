import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback } from '../services/supabaseRest.js';

const JWT_ISSUER = process.env.JWT_ISSUER || '10th-west-moto-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || '10th-west-moto-web';
const JWT_VERIFY_OPTIONS = {
  algorithms: ['HS256'],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  clockTolerance: 30,
};

const extractBearerToken = (authHeader) => {
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const readSessionAuth = (req) => {
  const sessionAuth = req.session?.auth;
  if (!sessionAuth || typeof sessionAuth !== 'object') return null;

  const userId = Number(sessionAuth.userId);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const tokenHash = String(sessionAuth.tokenHash || '').trim();
  if (!tokenHash) return null;

  return {
    userId,
    tokenHash,
    role: sessionAuth.role || null,
  };
};

const hydrateUserFromSession = async (req) => {
  const sessionAuth = readSessionAuth(req);
  if (!sessionAuth) return null;

  const sessionResult = await pool.query(
    `SELECT id
     FROM sessions
     WHERE token_hash = $1
       AND is_active = true
       AND expires_at > NOW()`,
    [sessionAuth.tokenHash]
  );

  if (sessionResult.rows.length === 0) {
    return null;
  }

  const userResult = await pool.query(
    `SELECT id, name, email, role, avatar, is_active, is_deleted, email_verified
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [sessionAuth.userId]
  );

  if (
    userResult.rows.length === 0
    || !userResult.rows[0].is_active
    || userResult.rows[0].is_deleted
    || !userResult.rows[0].email_verified
  ) {
    return null;
  }

  await pool.query(
    'UPDATE sessions SET last_active = NOW() WHERE token_hash = $1',
    [sessionAuth.tokenHash]
  );

  return userResult.rows[0];
};

const userFromDecodedToken = (decoded) => ({
  id: decoded.id,
  email: decoded.email || null,
  role: decoded.role || null,
});

export const authenticateOptional = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    try {
      const sessionUser = await hydrateUserFromSession(req);
      if (sessionUser) {
        req.user = sessionUser;
      }
    } catch (error) {
      console.error('Optional session authentication error:', error);
    }
    return next();
  }

  try {
    if (!process.env.JWT_SECRET) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);

    if (shouldUseDatabaseReadFallback()) {
      req.user = userFromDecodedToken(decoded);
      return next();
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token_hash = $1 AND user_id = $2 AND is_active = true AND expires_at > NOW()',
      [tokenHash, decoded.id]
    );

    if (sessionResult.rows.length === 0) return next();

    const userResult = await pool.query(
      `SELECT id, name, email, role, avatar, is_active, is_deleted, email_verified
       FROM users WHERE id = $1 LIMIT 1`,
      [decoded.id]
    );
    const user = userResult.rows[0];
    if (user?.is_active && !user?.is_deleted && user?.email_verified) {
      req.user = user;
    }
    next();
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);
        req.user = userFromDecodedToken(decoded);
      } catch {}
    }
    next(); // Invalid token, treat as guest
  }
};

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader);
  const trySessionFallback = async () => {
    const sessionUser = await hydrateUserFromSession(req);
    if (!sessionUser) return false;
    req.user = sessionUser;
    return true;
  };

  if (!token) {
    try {
      if (await trySessionFallback()) {
        return next();
      }
    } catch (error) {
      console.error('Session authentication error:', error);
      return res.status(500).json({
        message: 'Authentication check failed. Please try again.',
        code: 'AUTH_VALIDATION_FAILED',
      });
    }

    return res.status(401).json({
      message: 'Access token required',
      code: 'AUTH_TOKEN_REQUIRED',
    });
  }

  let decoded;
  try {
    if (!process.env.JWT_SECRET) {
      throw Object.assign(new Error('JWT secret is not configured'), { name: 'JwtConfigurationError' });
    }
    decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);
  } catch (err) {
    try {
      if (await trySessionFallback()) {
        return next();
      }
    } catch (sessionError) {
      console.error('Session authentication fallback error:', sessionError);
      return res.status(500).json({
        message: 'Authentication check failed. Please try again.',
        code: 'AUTH_VALIDATION_FAILED',
      });
    }

    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access token expired. Please log in again.',
        code: 'AUTH_TOKEN_EXPIRED',
      });
    }

    if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
      return res.status(401).json({
        message: 'Invalid access token.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    return res.status(500).json({
      message: 'Failed to validate authentication token.',
      code: 'AUTH_VALIDATION_FAILED',
    });
  }

  if (shouldUseDatabaseReadFallback()) {
    req.user = userFromDecodedToken(decoded);
    return next();
  }

  try {
    // Validate session is still active
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token_hash = $1 AND user_id = $2 AND is_active = true AND expires_at > NOW()',
      [tokenHash, decoded.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        message: 'Session expired or revoked. Please log in again.',
        code: 'AUTH_SESSION_EXPIRED',
      });
    } else {
      // Touch last_active
      await pool.query('UPDATE sessions SET last_active = NOW() WHERE id = $1', [sessionResult.rows[0].id]);
    }

    const userResult = await pool.query(
      `SELECT id, name, email, role, avatar, is_active, is_deleted, email_verified
       FROM users WHERE id = $1 LIMIT 1`,
      [decoded.id]
    );
    const currentUser = userResult.rows[0];
    if (!currentUser || !currentUser.is_active || currentUser.is_deleted) {
      return res.status(403).json({
        message: 'Account deactivated. Contact support.',
        code: 'AUTH_ACCOUNT_DEACTIVATED',
      });
    }

    if (!currentUser.email_verified) {
      return res.status(403).json({
        message: 'Email verification is required.',
        code: 'EMAIL_NOT_VERIFIED',
        requiresVerification: true,
      });
    }

    // Always use current database roles and account state, never JWT role claims.
    req.user = currentUser;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    if (isDatabaseConnectivityError(error)) {
      req.user = userFromDecodedToken(decoded);
      return next();
    }

    return res.status(503).json({
      message: 'Authentication service is temporarily unavailable. Please try again.',
      code: 'AUTH_SERVICE_UNAVAILABLE',
    });
  }
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

// Check specific permission
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // Admin, super_admin, owner always have all permissions
    if (['admin', 'super_admin', 'owner'].includes(req.user.role)) return next();

    try {
      // Check role permissions + user-specific overrides
      const result = await pool.query(
        `SELECT
           COALESCE(up.granted,
             (SELECT COUNT(*) > 0 FROM role_permissions rp
              JOIN permissions p2 ON p2.id = rp.permission_id
              WHERE rp.role = $2 AND p2.name = $3)
           ) as has_permission
         FROM permissions p
         LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = $1
         WHERE p.name = $3`,
        [req.user.id, req.user.role, permissionName]
      );

      if (result.rows.length === 0 || !result.rows[0].has_permission) {
        return res.status(403).json({ message: 'Permission denied' });
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};


export const optionalAuth = async (req, res, next) => authenticateOptional(req, res, next);

// Kept as a compatibility export for existing routes. It now accepts only
// signed backend tokens and secure server-side sessions.
export const authenticateTokenOrSupabaseToken = authenticateToken;
