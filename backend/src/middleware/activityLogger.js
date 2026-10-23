import pool from '../config/database.js';
import databaseConfig from '../config/databaseConfig.cjs';
import { auditOutcome } from '../utils/audit.js';

/**
 * Log a user/system activity to the activity_logs table.
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.action  - e.g. 'login', 'logout', 'login_failed', 'product.create', 'order.update'
 * @param {string} [params.entityType] - e.g. 'user', 'product', 'order'
 * @param {number} [params.entityId]
 * @param {object} [params.details] - arbitrary JSON
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 */
export const logActivity = async ({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
}) => {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, entityType, entityId, JSON.stringify({ outcome: auditOutcome(action), ...details }), ipAddress, userAgent]
    );
  } catch (err) {
    // Never let logging crash the request
    console.error('Activity log error:', databaseConfig.sanitizeDatabaseError(err));
  }
};

/**
 * Express middleware that extracts IP + user-agent and attaches a helper
 * `req.logActivity(action, entityType?, entityId?, details?)` to the request.
 */
export const activityLogger = (req, res, next) => {
  // Express resolves forwarding headers using the configured trusted proxy.
  const ip = req.ip || req.socket?.remoteAddress || null;
  const ua = String(req.headers['user-agent'] || '').slice(0, 512);

  req.clientIp = ip;
  req.clientUa = ua;
  req.logActivity = (action, entityType, entityId, details) => {
    return logActivity({
      userId: req.user?.id || null,
      action,
      entityType,
      entityId,
      details,
      ipAddress: ip,
      userAgent: ua,
    });
  };

  next();
};

export default { logActivity, activityLogger };
