import './config/environment.cjs';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createServer } from 'http';
import passport from './config/passport.js';
import { activityLogger } from './middleware/activityLogger.js';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import checkoutRoutes from './routes/checkout.js';
import paymentRoutes from './routes/payments.js';
import emailRoutes from './routes/email.js';
import inventoryRoutes from './routes/inventory.js';
import reportsRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';
import addressRoutes from './routes/addresses.js';
import returnRoutes from './routes/returns.js';
import supportRoutes from './routes/support.js';
import faqRoutes from './routes/faqs.js';
import policyRoutes from './routes/policies.js';
import staffRoutes from './routes/staff.js';
import notificationRoutes from './routes/notifications.js';
import bannerRoutes from './routes/banners.js';
import announcementRoutes from './routes/announcements.js';
import supplierRoutes from './routes/suppliers.js';
import variantRoutes from './routes/variants.js';
import subcategoryRoutes from './routes/subcategories.js';
import shippingRoutes from './routes/shipping.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import wishlistRoutes from './routes/wishlist.js';
import reviewRoutes from './routes/reviews.js';
import chatRoutes from './routes/chat.js';
import chatsRoutes from './routes/chats.js';
import sellerChatRoutes from './routes/sellerChats.js';
import shipmentRoutes from './routes/shipments.js';
import waybillRoutes from './routes/waybills.js';
import discountRoutes from './routes/discounts.js';
import refundRoutes from './routes/refunds.js';
import posRoutes from './routes/pos.js';

import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { errorLogger } from './middleware/errorLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generateCsrfToken, validateCsrf } from './middleware/csrf.js';
import pool from './config/database.js';
import { startExpiredReservationCleanup } from './controllers/secureCheckoutController.js';
import { getPaymongoConfigurationStatus } from './services/paymongo.js';
import { getShippingConfigurationStatus } from './services/shipping/providers/index.js';
import { getTrackingConfigurationStatus } from './services/tracking/providers/index.js';
import { startMaintenanceWorkers } from './services/maintenance.js';
import {
  buildPublicIntegrationReadiness,
  getEmailConfigurationStatus,
  getMediaConfigurationStatus,
  selectedIntegrationsReady,
} from './services/integrationReadiness.js';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
];

const productionRequiredEnvVars = [
  'SESSION_SECRET',
  'SESSION_STORE',
  'FRONTEND_ORIGIN',
  'COOKIE_SECURE',
  'COOKIE_SAME_SITE',
  'CSRF_SECRET',
  'TWO_FACTOR_ENCRYPTION_KEY',
];

if (isProduction) {
  requiredEnvVars.push(...productionRequiredEnvVars);
}

if (isProduction && String(process.env.SHIPPING_PROVIDER || '').toLowerCase() === 'mock') {
  console.error('The mock shipping provider cannot be selected in production.');
  process.exit(1);
}

if (isProduction && String(process.env.TRACKING_PROVIDER || '').toLowerCase() === 'mock') {
  console.error('The mock tracking provider cannot be selected in production.');
  process.exit(1);
}

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  const environmentLabel = isProduction ? 'production' : (process.env.NODE_ENV || 'development');
  console.error(`Missing required core environment variables for ${environmentLabel}: ${missingVars.join(', ')}`);
  if (isProduction) {
    console.error(`Required production core variables: ${productionRequiredEnvVars.join(', ')}`);
  }
  console.error('Optional integrations are not required for core startup; leave them empty until real credentials are available.');
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please copy backend/.env.example to backend/.env and fill in the values');
  process.exit(1);
}

const optionalUploadVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingUploadVars = optionalUploadVars.filter((varName) => !process.env[varName]);
if (missingUploadVars.length > 0) {
  console.warn('⚠️ Cloudinary is not configured. Product, review, and avatar uploads will be unavailable.');
  console.warn('⚠️ Missing Cloudinary env vars:', missingUploadVars.join(', '));
}

// Log configuration on startup (no sensitive values)
console.log('\n🔐 Configuration loaded:');
console.log('   Required core env:', isProduction ? 'production checks passed' : 'development checks passed');
console.log('   PayMongo:', getPaymongoConfigurationStatus().configured ? 'configured' : 'blocked_by_credentials');
console.log('   Shipping:', getShippingConfigurationStatus().status);
console.log('   Tracking:', getTrackingConfigurationStatus().status);
console.log('   Email:', getEmailConfigurationStatus().status);
console.log('   Media:', getMediaConfigurationStatus().status);
console.log('');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';
const PgSessionStore = connectPgSimple(session);
const parseDurationMs = (value, fallbackMs) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallbackMs;
  const match = text.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  const unit = match[2] || 's';
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
};
const configuredSessionSameSite = String(process.env.COOKIE_SAME_SITE || process.env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase();
const sessionCookieSameSite = ['lax', 'strict', 'none'].includes(configuredSessionSameSite)
  ? configuredSessionSameSite
  : 'lax';
const configuredCookieSecure = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
const sessionCookieSecure = ['true', '1', 'yes'].includes(configuredCookieSecure)
  || (!['false', '0', 'no'].includes(configuredCookieSecure) && (sessionCookieSameSite === 'none' || process.env.NODE_ENV === 'production'));
const sessionTtlMs = parseDurationMs(
  process.env.SESSION_TTL || process.env.SESSION_TTL_SECONDS,
  Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000)
);
const configuredSessionStore = String(process.env.SESSION_STORE || '').trim().toLowerCase();
const usePostgresSessionStore = configuredSessionStore === 'postgres' ||
  (process.env.NODE_ENV === 'production' && configuredSessionStore !== 'memory');
const sessionStore = usePostgresSessionStore
  ? new PgSessionStore({
      pool,
      tableName: 'http_sessions',
      createTableIfMissing: false,
    })
  : undefined;

if (!usePostgresSessionStore) {
  console.warn('Using in-memory sessions. Set SESSION_STORE=postgres to persist sessions in PostgreSQL.');
}

if (process.env.NODE_ENV === 'production' && configuredSessionStore !== 'postgres') {
  console.error('❌ SESSION_STORE=postgres is required in production.');
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && !sessionSecret) {
  console.error('❌ SESSION_SECRET is required in production.');
  process.exit(1);
}

if (!sessionSecret) {
  console.warn('⚠️ SESSION_SECRET is not set. Using an ephemeral secret for development only.');
}

const effectiveSessionSecret = sessionSecret || crypto.randomBytes(48).toString('hex');

// Build allowed origins for LAN access
function getAllowedOrigins() {
  const origins = [FRONTEND_URL];
  const extraOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  origins.push(...extraOrigins);
  if (process.env.NODE_ENV === 'production') {
    return Array.from(new Set(origins));
  }
  // Add all LAN IPs with the frontend port
  const port = new URL(FRONTEND_URL).port || '3000';
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        origins.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return origins;
}
const allowedOrigins = getAllowedOrigins();
const sessionMiddleware = session({
  ...(sessionStore ? { store: sessionStore } : {}),
  name: 'twm.sid',
  secret: effectiveSessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: process.env.NODE_ENV === 'production',
  cookie: {
    secure: sessionCookieSecure,
    httpOnly: true,
    sameSite: sessionCookieSameSite,
    path: '/',
    maxAge: sessionTtlMs
  }
});

// Initialize Socket.IO after session middleware is created so sockets can use
// the same HttpOnly session cookie as HTTP requests.
const io = initSocket(httpServer, allowedOrigins, { sessionMiddleware });

// Middleware
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 0);

// C8: Security headers via Helmet (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", ...allowedOrigins],
      frameSrc: ["'self'"],
    },
  },
  // C9: HSTS — enforce HTTPS in production
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false, // allow loading external images
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// C9: HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow same-network LAN requests (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    try {
      const url = new URL(origin);
      const host = url.hostname;
      if (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1' ||
          host.startsWith('192.168.') || host.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host))) {
        return callback(null, true);
      }
    } catch {}
    // C5: Reject unknown origins instead of allowing all
    callback(new Error('CORS not allowed'), false);
  },
  credentials: true
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  fallthrough: true,
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    if (String(req.originalUrl || '').startsWith('/api/payments/paymongo/webhook')
      || String(req.originalUrl || '').startsWith('/api/shipments/webhook')) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(activityLogger);
app.use('/api', apiLimiter);
// C12: Apply CSRF protection for non-Bearer state-changing requests
app.use('/api', validateCsrf);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: '10th West Moto API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const shipping = getShippingConfigurationStatus();
    const tracking = getTrackingConfigurationStatus();
    const paymongo = getPaymongoConfigurationStatus();
    const integrations = buildPublicIntegrationReadiness({ paymongo, shipping, tracking });
    const integrationsReady = selectedIntegrationsReady(integrations);
    res.json({
      status: 'available',
      core_ready: true,
      commerce_ready: true,
      integrations_ready: integrationsReady,
      integrations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ status: 'unavailable', core_ready: false, commerce_ready: false, integrations_ready: false, timestamp: new Date().toISOString() });
  }
});

// CSRF token endpoint (C12)
app.get('/api/csrf-token', generateCsrfToken, (req, res) => {
  res.json({ csrfToken: req.csrfToken });
});

// API Routes
// Apply the strict credential rate limit only to authentication mutations.
// Session/profile/permission reads have the general API limit so normal
// dashboard refreshes cannot exhaust the sign-in budget.
const credentialAuthPaths = new Set([
  '/login', '/register', '/send-otp', '/verify-otp', '/forgot-password',
  '/reset-password', '/resend-verification', '/verify-email',
]);
app.use('/api/auth', (req, res, next) => {
  if (req.method === 'POST' && credentialAuthPaths.has(req.path)) {
    return authLimiter(req, res, next);
  }
  return next();
}, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/seller/chats', sellerChatRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/waybills', waybillRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/pos', posRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error logging middleware (logs to error_logs table)
app.use(errorLogger);

// Global Error handling middleware (formats responses, hides stack trace in production)
app.use(errorHandler);

// Start server with Socket.IO
startExpiredReservationCleanup();
startMaintenanceWorkers();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║    10TH WEST MOTO - Backend API Server     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api`);
  console.log(`⚡ Socket.IO ready on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
  console.log(`🔗 LAN: http://${getLocalIP()}:${PORT}`);
  console.log('════════════════════════════════════════════════');
});

// Get local IP for LAN access
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

export default app;
