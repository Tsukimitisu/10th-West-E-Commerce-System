export const createCorsOptions = (allowedOrigins, env = process.env) => ({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (String(env.NODE_ENV).trim().toLowerCase() !== 'production') {
      try {
        const url = new URL(origin);
        if (['http:', 'https:'].includes(url.protocol) && (['localhost', '127.0.0.1'].includes(url.hostname)
          || /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname))) return callback(null, true);
      } catch { /* Reject malformed origins without reflecting them. */ }
    }
    return callback(Object.assign(new Error('CORS origin not permitted.'), { status: 403 }), false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
