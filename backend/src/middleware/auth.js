import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
        return res.status(403).json({ message: 'Session expired or revoked. Please log in again.' });
      }
    } else {
      // Touch last_active
      await pool.query('UPDATE sessions SET last_active = NOW() WHERE id = $1', [sessionResult.rows[0].id]);
    }

    // Check user is_active
    const userResult = await pool.query('SELECT is_active FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length > 0 && !userResult.rows[0].is_active) {
      return res.status(403).json({ message: 'Account deactivated. Contact support.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
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
