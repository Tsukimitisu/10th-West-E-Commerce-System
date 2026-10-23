import pool from '../config/database.js';
import { releaseExpiredReservations } from '../controllers/secureCheckoutController.js';
import { cleanupRateLimitRecords } from '../middleware/rateLimiter.js';
import { randomUUID } from 'node:crypto';

let maintenanceTimer = null;

export const cleanupIntervalMs = (env = process.env) => Math.max(60000, Number(env.SESSION_CLEANUP_INTERVAL_MS || env.MAINTENANCE_CLEANUP_INTERVAL_MS) || 5 * 60 * 1000);

export const cleanupStatus = async (db = pool, { env = process.env, now = Date.now() } = {}) => {
  const row = (await db.query('SELECT * FROM system_cleanup_status WHERE id=1')).rows[0] || {};
  const interval = cleanupIntervalMs(env);
  const started = row.last_started_at ? new Date(row.last_started_at).getTime() : null;
  const disabled = String(env.MAINTENANCE_CLEANUP_DISABLED).toLowerCase() === 'true';
  const stale = started !== null && now > started + Math.max(interval * 3, 3 * 60000);
  const counts = row.last_counts && typeof row.last_counts === 'object' ? Object.fromEntries(
    ['reservations_released', 'sessions_expired', 'http_sessions_deleted', 'idempotency_keys_deleted', 'rate_limits_deleted', 'notification_deliveries_deleted']
      .map(key => [key, Math.max(0, Number(row.last_counts[key]) || 0)])) : null;
  return { status: disabled || !started ? 'not_running' : stale || row.last_result === 'failed' ? 'needs_attention' : 'healthy',
    running: Boolean(row.running), last_started_at: row.last_started_at || null,
    last_cleanup: row.last_completed_at || null, last_result: row.last_result || null,
    next_expected_run: !disabled && started ? new Date(started + interval).toISOString() : null,
    last_counts: counts, stale, disabled };
};

export const runMaintenanceCleanup = async ({ db = pool, releaseReservations = releaseExpiredReservations, cleanupLimits = cleanupRateLimitRecords } = {}) => {
  const runId = randomUUID();
  const claimed = await db.query(`UPDATE system_cleanup_status SET run_id=$1,running=true,last_started_at=NOW()
    WHERE id=1 AND (running=false OR last_started_at < NOW()-INTERVAL '30 minutes') RETURNING id`, [runId]);
  if (!claimed.rows.length) return { skipped: true };
  const summary = {
    reservations_released: 0,
    sessions_expired: 0,
    http_sessions_deleted: 0,
    idempotency_keys_deleted: 0,
    rate_limits_deleted: 0,
    notification_deliveries_deleted: 0,
  };

  try {
    summary.reservations_released = await releaseReservations();

    const sessions = await db.query(
      `UPDATE sessions
       SET is_active = false
       WHERE is_active = true AND expires_at <= NOW()`
    );
    summary.sessions_expired = sessions.rowCount || 0;

    const httpSessions = await db.query(
      `DELETE FROM http_sessions
       WHERE expire < NOW()`
    ).catch((error) => {
      if (error?.code !== '42P01') throw error;
      return { rowCount: 0 };
    });
    summary.http_sessions_deleted = httpSessions.rowCount || 0;

    const idempotency = await db.query(
      `DELETE FROM idempotency_keys
       WHERE expires_at < NOW() - INTERVAL '24 hours'`
    );
    summary.idempotency_keys_deleted = idempotency.rowCount || 0;

    summary.rate_limits_deleted = await cleanupLimits();

    const notifications = await db.query(
      `DELETE FROM notification_deliveries
       WHERE status IN ('sent', 'failed', 'cancelled')
         AND created_at < NOW() - INTERVAL '30 days'`
    );
    summary.notification_deliveries_deleted = notifications.rowCount || 0;

    const total = Object.values(summary).reduce((sum, value) => sum + Number(value || 0), 0);
    if (total > 0) {
      console.log('Maintenance cleanup completed:', summary);
    }

    await db.query(`UPDATE system_cleanup_status SET running=false,last_completed_at=NOW(),last_result='successful',last_counts=$2::jsonb,failure_code=NULL WHERE id=1 AND run_id=$1`, [runId, JSON.stringify(summary)]);
    return summary;
  } catch (error) {
    await db.query(`UPDATE system_cleanup_status SET running=false,last_completed_at=NOW(),last_result='failed',last_counts=$2::jsonb,failure_code='CLEANUP_FAILED' WHERE id=1 AND run_id=$1`, [runId, JSON.stringify(summary)]);
    throw error;
  }
};

export const startMaintenanceWorkers = ({ run = runMaintenanceCleanup, intervalMs = cleanupIntervalMs() } = {}) => {
  if (maintenanceTimer || String(process.env.MAINTENANCE_CLEANUP_DISABLED || '').toLowerCase() === 'true') {
    return maintenanceTimer;
  }

  const safeInterval = Math.max(60000, Number(intervalMs) || 5 * 60 * 1000);
  maintenanceTimer = setInterval(() => {
    run().catch(() => {
      console.error('Scheduled maintenance cleanup failed. Check automatic cleanup status.');
    });
  }, safeInterval);
  maintenanceTimer.unref?.();
  return maintenanceTimer;
};
