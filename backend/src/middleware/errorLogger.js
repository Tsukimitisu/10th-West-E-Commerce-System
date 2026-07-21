import pool from '../config/database.js';
import databaseConfig from '../config/databaseConfig.cjs';

const { isDatabaseUnavailableError, sanitizeDatabaseError } = databaseConfig;

const getSafeEndpoint = (req) => {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  return `${req.method} ${path}`;
};

export const errorLogger = async (err, req, _res, next) => {
  const safeError = sanitizeDatabaseError(err);

  if (isDatabaseUnavailableError(err)) {
    console.error('Database unavailable request:', {
      endpoint: getSafeEndpoint(req),
      error: safeError,
    });
    return next(err);
  }

  try {
    await pool.query(
      `INSERT INTO error_logs (error_type, message, stack_trace, endpoint, user_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        String(err.type || safeError.code || 'api_error').slice(0, 100),
        safeError.message,
        null,
        getSafeEndpoint(req),
        req.user?.id || null,
        req.ip || req.connection?.remoteAddress || null,
        JSON.stringify({
          queryFields: Object.keys(req.query || {}),
          bodyFields: req.body ? Object.keys(req.body) : [],
        }),
      ]
    );
  } catch (logErr) {
    console.error('Error logging failed:', sanitizeDatabaseError(logErr));
  }
  return next(err);
};
