import express from 'express';
import { body } from 'express-validator';
import passport from '../config/passport.js';
import {
  register, login, logout, getProfile,
  forgotPassword, resetPassword, verifyResetToken, changePassword,
  setup2FA, verify2FA, disable2FA,
  oauthCallback, exchangeOAuthCode,
  getActiveSessions, revokeSession,
  getActivityLogs, sendRegistrationOtp,
  deleteAccountHandler, resendVerification, verifyEmailToken, exportUserData,
} from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import {
  resendVerificationLimiter,
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  verifyResetTokenLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimiter.js';

const router = express.Router();

const GMAIL_TYPO_DOMAINS = new Set([
  'gmai.com',
  'gmial.com',
  'gmail.co',
  'gmail.con',
  'gmail.cm',
  'gnail.com',
  'gmailcom',
]);

const emailValidation = () =>
  body('email')
    .trim()
    .customSanitizer((value) => String(value || '').trim().toLowerCase())
    .isEmail({
      allow_display_name: false,
      require_tld: true,
      ignore_max_length: false,
      domain_specific_validation: true,
    })
    .withMessage('Please enter a valid email address')
    .bail()
    .custom((value) => {
      const normalized = String(value || '').toLowerCase();

      if (normalized.includes('..')) {
        throw new Error('Please enter a valid email address');
      }

      const domain = normalized.split('@')[1] || '';
      if (GMAIL_TYPO_DOMAINS.has(domain)) {
        throw new Error('Did you mean @gmail.com?');
      }

      return true;
    });

// ─── Validation rules ──────────────────────────────────────────────
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .escape(),
  emailValidation(),
  body('password').isStrongPassword({
    minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0
  }).withMessage('Password must be at least 8 characters and include uppercase, lowercase, and a number'),
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
  body('consent_given')
    .custom((value) => value === true)
    .withMessage('You must agree to the Terms of Service and Privacy Policy'),
  body('age_confirmed')
    .custom((value) => value === true)
    .withMessage('You must confirm you are at least 18 years old'),
];

const loginValidation = [
  emailValidation(),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Public routes ─────────────────────────────────────────────────
router.post('/send-registration-otp', registerLimiter, registerValidation.slice(0, 2), validate, sendRegistrationOtp);

router.post('/register',
  registerLimiter,
  registerValidation,
  validate,
  register
);
router.post('/login', loginLimiter, loginValidation, validate, login);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  emailValidation(),
  validate,
  forgotPassword
);
router.post(
  '/verify-reset-token',
  verifyResetTokenLimiter,
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  validate,
  verifyResetToken
);
router.post('/reset-password',
  resetPasswordLimiter,
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
    .withMessage('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character'),
  validate,
  resetPassword
);

// OAuth code exchange (used by frontend after OAuth redirect)
router.post('/exchange-code', body('code').notEmpty(), validate, exchangeOAuthCode);

// ─── OAuth: Google ─────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/#/login?error=google_failed' }),
  (req, res, next) => { req.oauthUser = req.user; next(); },
  oauthCallback
);

// ─── OAuth: Facebook ───────────────────────────────────────────────
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/#/login?error=facebook_failed' }),
  (req, res, next) => { req.oauthUser = req.user; next(); },
  oauthCallback
);

// ─── Protected routes ──────────────────────────────────────────────
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);
router.put('/change-password',
  authenticateToken,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate,
  changePassword
);

// ─── 2FA ───────────────────────────────────────────────────────────
router.get('/2fa/setup', authenticateToken, setup2FA);
router.post('/2fa/verify', authenticateToken, body('totp_code').notEmpty(), validate, verify2FA);
router.delete('/2fa', authenticateToken, body('password').notEmpty(), validate, disable2FA);

// ─── Session management ────────────────────────────────────────────
router.get('/sessions', authenticateToken, getActiveSessions);
router.delete('/sessions/:sessionId', authenticateToken, revokeSession);

// ─── Activity logs (admin, super_admin, owner) ────────────────────────────────
router.get('/activity-logs', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getActivityLogs);

// ─── Account deletion (Right to be Forgotten - RA 10173) ────────────────────
router.delete('/account',
  authenticateToken,
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  deleteAccountHandler
);

// ─── Data export / portability (RA 10173 §18) ──────────────────────────────
router.get('/export-data', authenticateToken, exportUserData);

// ─── Email verification ────────────────────────────────────────────
router.post('/resend-verification',
  resendVerificationLimiter,
  emailValidation(),
  validate,
  resendVerification
);
router.post(
  '/verify-email',
  body('token')
    .trim()
    .notEmpty().withMessage('Verification token is required')
    .isLength({ min: 64, max: 64 }).withMessage('Invalid verification token format')
    .matches(/^[a-f0-9]+$/i).withMessage('Invalid verification token format'),
  validate,
  verifyEmailToken
);

export default router;
