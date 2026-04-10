import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
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
import wishlistRoutes from './routes/wishlist.js';
import reviewRoutes from './routes/reviews.js';

import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { errorLogger } from './middleware/errorLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generateCsrfToken, validateCsrf } from './middleware/csrf.js';
import pool from './config/database.js';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '..', '.env');
console.log('📍 Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Validate required environment variables
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'EMAIL_HOST',
  'EMAIL_FROM'
];

if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET');
}

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please copy backend/.env.example to backend/.env and fill in the values');
  process.exit(1);
}

// Log configuration on startup (no sensitive values)
console.log('\n🔐 Configuration loaded:');
console.log('   Stripe Secret:', process.env.STRIPE_SECRET_KEY ? '✅ SET' : '❌ NOT SET');
console.log('   Stripe Public:', process.env.STRIPE_PUBLISHABLE_KEY ? '✅ SET' : '❌ NOT SET');
console.log('   Email User:', process.env.EMAIL_USER ? '✅ SET' : '❌ NOT SET');
console.log('   Email Password:', process.env.EMAIL_PASSWORD ? '✅ SET' : '❌ NOT SET');
console.log('   Cloudinary:', (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) ? '✅ SET' : '❌ NOT SET');
console.log('');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const uploadsDir = path.join(__dirname, '..', 'uploads');
const PgSessionStore = connectPgSimple(session);
const configuredSessionSameSite = String(process.env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase();
const sessionCookieSameSite = ['lax', 'strict', 'none'].includes(configuredSessionSameSite)
  ? configuredSessionSameSite
  : (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
const sessionCookieSecure = sessionCookieSameSite === 'none' || process.env.NODE_ENV === 'production';

const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && !sessionSecret) {
  console.error('❌ SESSION_SECRET is required in production.');
  process.exit(1);
}

if (!sessionSecret) {
  console.warn('⚠️ SESSION_SECRET is not set. Using an ephemeral secret for development only.');
}

const effectiveSessionSecret = sessionSecret || crypto.randomBytes(48).toString('hex');

// Initialize Socket.IO
const io = initSocket(httpServer, FRONTEND_URL);

// Build allowed origins for LAN access
function getAllowedOrigins() {
  const origins = [FRONTEND_URL];
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

// Middleware
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 0);

// C8: Security headers via Helmet (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", ...allowedOrigins, "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
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
      if (host === 'localhost' || host === '127.0.0.1' ||
          host.startsWith('192.168.') || host.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return callback(null, true);
      }
    } catch {}
    // C5: Reject unknown origins instead of allowing all
    callback(new Error('CORS not allowed'), false);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgSessionStore({
    pool,
    tableName: 'http_sessions',
    createTableIfMissing: true,
  }),
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
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(uploadsDir));
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

// CSRF token endpoint (C12)
app.get('/api/csrf-token', generateCsrfToken, (req, res) => {
  res.json({ csrfToken: req.csrfToken });
});

// API Routes
// C6: Apply stricter rate limiting to auth endpoints (20 req / 15 min)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
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
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error logging middleware (logs to error_logs table)
app.use(errorLogger);

// Global Error handling middleware (formats responses, hides stack trace in production)
app.use(errorHandler);

// Start server with Socket.IO
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
