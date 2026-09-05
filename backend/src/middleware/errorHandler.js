import databaseConfig from '../config/databaseConfig.cjs';

const { isDatabaseUnavailableError, sanitizeDatabaseError } = databaseConfig;
const DATABASE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

export const errorHandler = (err, req, res, _next) => {
  const safeError = sanitizeDatabaseError(err);
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    endpoint: `${req.method} ${req.originalUrl}`,
    error: safeError,
  });

  if (isDatabaseUnavailableError(err)) {
    return res.status(503).json({
      message: DATABASE_UNAVAILABLE_MESSAGE,
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload format.' });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Authentication required or token expired.' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ message: 'Resource already exists.' });
  }

  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode >= 500
    ? (statusCode === 503 ? DATABASE_UNAVAILABLE_MESSAGE : 'Internal server error')
    : (err.message || 'An unexpected error occurred');

  return res.status(statusCode).json({ message });
};
