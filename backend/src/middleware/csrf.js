import crypto from 'crypto';

const CSRF_TTL_MS = Number(process.env.CSRF_TOKEN_TTL_MS || 60 * 60 * 1000);
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.SESSION_SECRET || 'dev-csrf-secret';

const toBase64Url = (value) => Buffer.from(value).toString('base64url');
const fromBase64Url = (value) => Buffer.from(value, 'base64url').toString('utf8');

const getCsrfScope = (req) => String(req.sessionID || req.headers['x-session-id'] || req.ip || 'unknown');

const signPayload = (payloadBase64) => {
  return crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(payloadBase64)
    .digest('base64url');
};

const createCsrfToken = (scope) => {
  const payload = {
    scope,
    nonce: crypto.randomBytes(12).toString('hex'),
    exp: Date.now() + CSRF_TTL_MS,
  };
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
};

const verifyCsrfToken = (token, scope) => {
  if (typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const [payloadBase64, signature] = parts;
  const expectedSignature = signPayload(payloadBase64);

  const incomingSig = Buffer.from(signature);
  const expectedSig = Buffer.from(expectedSignature);

  if (incomingSig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(incomingSig, expectedSig)) return false;

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(payloadBase64));
  } catch {
    return false;
  }

  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return false;

  return payload.scope === scope;
};

export const generateCsrfToken = (req, res, next) => {
  const finalize = () => {
    const scope = getCsrfScope(req);
    const token = createCsrfToken(scope);

    res.cookie('csrf-token', token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });

    req.csrfToken = token;
    next();
  };

  if (req.session) {
    req.session.csrfIssuedAt = Date.now();
    return req.session.save((error) => {
      if (error) return next(error);
      return finalize();
    });
  }

  return finalize();
};

export const validateCsrf = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip for API calls with Bearer token (already authenticated)
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) return next();

  const token = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || req.body?._csrf;
  const scope = getCsrfScope(req);

  if (!verifyCsrfToken(token, scope)) {
    return res.status(403).json({
      message: 'Invalid CSRF token',
      code: 'CSRF_INVALID_TOKEN',
    });
  }

  next();
};
