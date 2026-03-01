import express from 'express';
import { body } from 'express-validator';
import passport from '../config/passport.js';
import {
  register, login, logout, getProfile,
  forgotPassword, resetPassword, verifyResetToken, changePassword,
  setup2FA, verify2FA, disable2FA,
  oauthCallback,
  getActiveSessions, revokeSession,
  getActivityLogs,
  deleteAccountHandler, resendVerification, verifyEmailToken, exportUserData,
} from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

// ─── Validation rules ──────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Public routes ─────────────────────────────────────────────────
router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/forgot-password', body('email').isEmail(), validate, forgotPassword);
router.post('/verify-reset-token', body('token').notEmpty(), validate, verifyResetToken);
router.post('/reset-password',
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate,
  resetPassword
);

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
router.delete('/account', authenticateToken, deleteAccountHandler);

// ─── Data export / portability (RA 10173 §18) ──────────────────────────────
router.get('/export-data', authenticateToken, exportUserData);

// ─── Email verification ────────────────────────────────────────────
router.post('/resend-verification', authenticateToken, resendVerification);
router.post('/verify-email', body('token').notEmpty(), validate, verifyEmailToken);

export default router;
