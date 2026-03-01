import pool from '../config/database.js';

export const errorLogger = async (err, req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO error_logs (error_type, message, stack_trace, endpoint, user_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        err.type || 'api_error',
        err.message || 'Unknown error',
        err.stack || null,
        `${req.method} ${req.originalUrl}`,
        req.user?.id || null,
        req.ip || req.connection?.remoteAddress || null,
        JSON.stringify({ query: req.query, body: req.body ? Object.keys(req.body) : [] }),
      ]
    );
  } catch (logErr) {
    console.error('Error logging failed:', logErr.message);
  }
  next(err);
};
