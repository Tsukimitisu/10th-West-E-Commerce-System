import pool from '../config/database.js';
import { releaseExpiredReservations } from '../controllers/secureCheckoutController.js';
import { cleanupRateLimitRecords } from '../middleware/rateLimiter.js';

let maintenanceTimer = null;

export const runMaintenanceCleanup = async () => {
  const summary = {
    reservations_released: 0,
    sessions_expired: 0,
    http_sessions_deleted: 0,
    idempotency_keys_deleted: 0,
    rate_limits_deleted: 0,
    notification_deliveries_deleted: 0,
  };

  summary.reservations_released = await releaseExpiredReservations();

  const sessions = await pool.query(
    `UPDATE sessions
     SET is_active = false, updated_at = NOW()
     WHERE is_active = true AND expires_at <= NOW()`
  );
  summary.sessions_expired = sessions.rowCount || 0;

  const httpSessions = await pool.query(
    `DELETE FROM http_sessions
     WHERE expire < NOW()`
  ).catch((error) => {
    if (error?.code !== '42P01') throw error;
    return { rowCount: 0 };
  });
  summary.http_sessions_deleted = httpSessions.rowCount || 0;

  const idempotency = await pool.query(
    `DELETE FROM idempotency_keys
     WHERE expires_at < NOW() - INTERVAL '24 hours'`
  );
  summary.idempotency_keys_deleted = idempotency.rowCount || 0;

  summary.rate_limits_deleted = await cleanupRateLimitRecords();

  const notifications = await pool.query(
    `DELETE FROM notification_deliveries
     WHERE status IN ('sent', 'failed', 'cancelled')
       AND created_at < NOW() - INTERVAL '30 days'`
  );
  summary.notification_deliveries_deleted = notifications.rowCount || 0;

  const total = Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total > 0) {
    console.log('Maintenance cleanup completed:', summary);
  }

  return summary;
};

export const startMaintenanceWorkers = ({ intervalMs = Number(process.env.SESSION_CLEANUP_INTERVAL_MS || process.env.MAINTENANCE_CLEANUP_INTERVAL_MS || 5 * 60 * 1000) } = {}) => {
  if (maintenanceTimer || String(process.env.MAINTENANCE_CLEANUP_DISABLED || '').toLowerCase() === 'true') {
    return maintenanceTimer;
  }

  const safeInterval = Math.max(60000, Number(intervalMs) || 5 * 60 * 1000);
  maintenanceTimer = setInterval(() => {
    runMaintenanceCleanup().catch((error) => {
      console.error('Scheduled maintenance cleanup failed:', error);
    });
  }, safeInterval);
  maintenanceTimer.unref?.();
  return maintenanceTimer;
};
