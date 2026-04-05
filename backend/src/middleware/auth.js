import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js';

const extractBearerToken = (authHeader) => {
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const decodeSupabaseFallbackToken = (token) => {
  if (typeof token !== 'string' || !token.startsWith('sb-token-')) {
    return null;
  }

  const payloadBase64 = token.slice('sb-token-'.length);
  if (!payloadBase64) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;

    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return null;

    return {
      id,
      email: payload.email || null,
      role: payload.role || null,
    };
  } catch {
    return null;
  }
};

export const authenticateOptional = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token_hash = $1 AND is_active = true AND expires_at > NOW()',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      const anySession = await pool.query('SELECT COUNT(*) FROM sessions WHERE user_id = $1', [decoded.id]);
      if (parseInt(anySession.rows[0].count) > 0) {
        return next(); // Expired, treat as guest
      }
    }

    const userResult = await pool.query('SELECT is_active FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
      req.user = decoded;
    }
    next();
  } catch (err) {
    next(); // Invalid token, treat as guest
  }
};

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return res.status(401).json({
      message: 'Access token required',
      code: 'AUTH_TOKEN_REQUIRED',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { clockTolerance: 30 });
  } catch (err) {
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

  try {
    // Validate session is still active
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token_hash = $1 AND is_active = true AND expires_at > NOW()',
      [tokenHash]
    );

    // If sessions table is populated, check validity; allow legacy tokens without sessions
    if (sessionResult.rows.length === 0) {
      const anySession = await pool.query('SELECT COUNT(*) FROM sessions WHERE user_id = $1', [decoded.id]);
      if (parseInt(anySession.rows[0].count) > 0) {
        return res.status(401).json({
          message: 'Session expired or revoked. Please log in again.',
          code: 'AUTH_SESSION_EXPIRED',
        });
      }
    } else {
      // Touch last_active
      await pool.query('UPDATE sessions SET last_active = NOW() WHERE id = $1', [sessionResult.rows[0].id]);
    }

    // Check user is_active
    const userResult = await pool.query('SELECT is_active FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length > 0 && !userResult.rows[0].is_active) {
      return res.status(403).json({
        message: 'Account deactivated. Contact support.',
        code: 'AUTH_ACCOUNT_DEACTIVATED',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      message: 'Authentication check failed. Please try again.',
      code: 'AUTH_VALIDATION_FAILED',
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

export const authenticateTokenOrSupabaseToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader);

  if (!token) {
    return res.status(401).json({
      message: 'Access token required',
      code: 'AUTH_TOKEN_REQUIRED',
    });
  }

  const fallbackPayload = decodeSupabaseFallbackToken(token);
  if (!fallbackPayload) {
    return authenticateToken(req, res, next);
  }

  try {
    const userResult = await pool.query(
      'SELECT id, name, email, role, avatar, is_active FROM users WHERE id = $1 LIMIT 1',
      [fallbackPayload.id],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        message: 'User not found for access token.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json({
        message: 'Account deactivated. Contact support.',
        code: 'AUTH_ACCOUNT_DEACTIVATED',
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    };

    return next();
  } catch (error) {
    console.error('Hybrid token authentication error:', error);
    return res.status(500).json({
      message: 'Authentication check failed. Please try again.',
      code: 'AUTH_VALIDATION_FAILED',
    });
  }
};
