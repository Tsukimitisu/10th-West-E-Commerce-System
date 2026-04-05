export const errorHandler = (err, req, res, next) => {
  // 1. Log the full error on the server
  console.error(`[ERROR] ${new Date().toISOString()}`);
  console.error(`Endpoint: ${req.method} ${req.originalUrl}`);
  console.error(err.stack || err.message || err);

  // 2. Identify specific errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload format.' });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Authentication required or token expired.' });
  }

  // Postgres unique constraint violation
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Resource already exists.' });
  }

  // 3. Format production vs development response
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;
  
  const errorResponse = {
    message: isProduction && statusCode === 500 
      ? 'Internal server error' 
      : err.message || 'An unexpected error occurred',
  };

  // Only include stack trace if NOT in production
  if (!isProduction) {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};
