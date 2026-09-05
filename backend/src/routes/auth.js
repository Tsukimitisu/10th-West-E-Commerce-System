import express from 'express';
import { body, matchedData, validationResult } from 'express-validator';
import passport, {
  FACEBOOK_OAUTH_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  getFacebookOAuthConfigurationStatus,
  getGoogleOAuthConfigurationStatus,
} from '../config/passport.js';
import { resolveFrontendOrigin } from '../config/frontend.js';
import {
  register, login, logout, getProfile,
  forgotPassword, resetPassword, verifyResetToken, changePassword,
  setup2FA, verify2FA, disable2FA,
  facebookOAuthCallback, googleOAuthCallback, exchangeOAuthCode,
  getActiveSessions, revokeSession,
  getActivityLogs, sendRegistrationOtp,
  deleteAccountHandler, resendVerification, verifyEmailToken, exportUserData, getMyPermissions,
} from '../controllers/authController.js';
import { authenticateOptional, authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { getPaymongoConfigurationStatus } from '../services/paymongo.js';
import { phoneOtpReadiness } from '../services/phoneOtp.js';
import {
  resendVerificationLimiter,
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  verifyResetTokenLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimiter.js';

const router = express.Router();

export const getGoogleAuthAvailability = ({
  configuration = getGoogleOAuthConfigurationStatus(),
  strategyAvailable = Boolean(passport._strategy('google')),
} = {}) => {
  const available = Boolean(configuration.configured && strategyAvailable);
  const reason = available
    ? null
    : configuration.configured
      ? 'google_oauth_restart_required'
      : 'missing_google_oauth_config';

  return {
    available,
    reason,
    client_id_present: Boolean(configuration.clientIdPresent),
    client_secret_present: Boolean(configuration.clientSecretPresent),
    callback_url_present: Boolean(configuration.callbackUrlPresent),
    callback_url: configuration.callbackUrl || null,
  };
};

export const getFacebookAuthAvailability = ({
  configuration = getFacebookOAuthConfigurationStatus(),
  strategyAvailable = Boolean(passport._strategy('facebook')),
} = {}) => {
  const available = Boolean(configuration.configured && strategyAvailable);
  const reason = available
    ? null
    : configuration.configured
      ? 'facebook_oauth_restart_required'
      : 'missing_facebook_oauth_config';

  return {
    available,
    reason,
    app_id_present: Boolean(configuration.appIdPresent),
    app_secret_present: Boolean(configuration.appSecretPresent),
    callback_url_present: Boolean(configuration.callbackUrlPresent),
    callback_url: configuration.callbackUrl || null,
  };
};

export const getAuthAvailability = () => {
  const gcashAvailable = getPaymongoConfigurationStatus().configured;

  return {
    google: getGoogleAuthAvailability(),
    facebook: getFacebookAuthAvailability(),
    two_factor: {
      available: true,
      reason: null,
      method: 'totp',
    },
    gcash: {
      available: gcashAvailable,
      reason: gcashAvailable ? null : 'not_configured',
    },
    phone_verification: phoneOtpReadiness(),
  };
};

router.get('/providers', (_req, res) => {
  res.json(getAuthAvailability());
});

const getFrontendUrl = () => resolveFrontendOrigin();

const redirectToOAuthError = (res, errorCode, { provider = null, reason = null } = {}) => {
  const params = new URLSearchParams({ error: errorCode });
  if (provider) params.set(provider, 'failed');
  if (reason) params.set('reason', reason);
  res.redirect(`${getFrontendUrl()}/#/login?${params.toString()}`);
};

const getSafeProviderFailureReason = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (/redirect_uri|redirect uri/.test(message) || code === 'redirect_uri_mismatch') return 'redirect_uri_mismatch';
  if (/invalid_client|invalid client/.test(message) || code === 'invalid_client') return 'invalid_client';
  return 'callback_failed';
};

const handleOAuthProviderResponseError = (provider) => (req, res, next) => {
  const providerError = String(req.query?.error || '').trim().toLowerCase();
  if (!providerError) return next();
  const reason = providerError === 'access_denied' ? 'access_denied' : 'callback_failed';
  if (provider === 'facebook') console.warn('FACEBOOK_CALLBACK_FAILED', { reason_code: reason });
  return redirectToOAuthError(
    res,
    providerError === 'access_denied' ? 'access_denied' : `${provider}_failed`,
    { provider, reason }
  );
};

const ensureOAuthProviderConfigured = (provider) => (req, res, next) => {
  const isConfigured = provider === 'google'
    ? getGoogleAuthAvailability().available
    : getFacebookAuthAvailability().available;

  if (!isConfigured || !passport._strategy(provider)) {
    return redirectToOAuthError(res, `${provider}_not_configured`, {
      provider,
      reason: 'not_configured',
    });
  }

  next();
};

const completeOAuthAuthentication = (provider) => (req, res, next) => {
  passport.authenticate(provider, { session: false }, (err, user, info) => {
    if (err) {
      console.error(`${provider} OAuth provider request failed`, {
        reason_code: provider === 'google' ? 'GOOGLE_CALLBACK_ERROR' : `${provider.toUpperCase()}_CALLBACK_ERROR`,
        name: String(err?.name || 'OAuthError').slice(0, 80),
      });
      const reason = getSafeProviderFailureReason(err);
      return redirectToOAuthError(res, `${provider}_failed`, { provider, reason });
    }

    if (!user) {
      const stateFailure = /authorization request state/i.test(String(info?.message || ''));
      if (provider === 'google') {
        console.error('Google OAuth callback rejected provider response', {
          reason_code: stateFailure ? 'OAUTH_STATE_MISMATCH' : 'GOOGLE_CALLBACK_ERROR',
        });
      }
      if (provider === 'facebook') {
        console.warn('FACEBOOK_CALLBACK_FAILED', {
          reason_code: stateFailure ? 'state_mismatch' : 'passport_failed',
        });
      }
      if (stateFailure) return redirectToOAuthError(res, 'oauth_invalid_state', { provider, reason: 'state_mismatch' });
      return redirectToOAuthError(res, `${provider}_failed`, { provider, reason: 'callback_failed' });
    }

    req.oauthUser = user;
    next();
  })(req, res, next);
};

const GMAIL_TYPO_DOMAINS = new Set([
  'gmai.com',
  'gmial.com',
  'gmail.co',
  'gmail.con',
  'gmail.cm',
  'gnail.com',
  'gmailcom',
]);

const EMAIL_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const emailValidation = () =>
  body('email')
    .trim()
    .customSanitizer((value) => String(value || '').trim().toLowerCase())
    .custom((value) => {
      const normalized = String(value || '').toLowerCase();

      if (!EMAIL_REGEX.test(normalized)) {
        throw new Error('Please enter a valid email address');
      }

      const domain = normalized.split('@')[1] || '';
      if (GMAIL_TYPO_DOMAINS.has(domain)) {
        throw new Error('Did you mean @gmail.com?');
      }

    return true;
  });

const validateVerifyEmailRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const rawErrors = errors.array();
    const fieldErrors = rawErrors.reduce((acc, error) => {
      if (error.type === 'field' && error.path && !acc[error.path]) {
        acc[error.path] = error.msg;
      }
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      message: fieldErrors.token || rawErrors[0]?.msg || 'Invalid verification link.',
      code: 'VERIFICATION_TOKEN_INVALID',
      errors: rawErrors,
      fieldErrors,
    });
  }

  req.validatedData = matchedData(req, { locations: ['body', 'query', 'params'] });
  next();
};

// ─── Validation rules ──────────────────────────────────────────────
export const registerValidation = [
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
  body('totp_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Two-factor code must contain exactly 6 digits'),
  body('recovery_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^[a-f0-9]{8}-[a-f0-9]{8}$/i)
    .withMessage('Recovery code format is invalid'),
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
router.get('/google',
  ensureOAuthProviderConfigured('google'),
  (req, _res, next) => {
    console.info('GOOGLE_AUTH_START', {
      has_session: Boolean(req.session),
      callback_url: getGoogleAuthAvailability().callback_url,
    });
    next();
  },
  (req, res, next) => {
    const authenticate = passport.authenticate('google', { scope: GOOGLE_OAUTH_SCOPES, session: false });
    const handleError = (error) => {
      if (!error) return next();
      console.error('GOOGLE_AUTH_START_FAILED', {
        reason: error?.name || 'oauth_start_failed',
        message: String(error?.message || 'OAuth start failed').slice(0, 200),
      });
      return redirectToOAuthError(res, 'google_failed');
    };
    try {
      return authenticate(req, res, handleError);
    } catch (error) {
      return handleError(error);
    }
  }
);
router.get('/google/callback',
  ensureOAuthProviderConfigured('google'),
  handleOAuthProviderResponseError('google'),
  completeOAuthAuthentication('google'),
  googleOAuthCallback
);

// ─── OAuth: Facebook ───────────────────────────────────────────────
router.get('/facebook',
  ensureOAuthProviderConfigured('facebook'),
  (req, _res, next) => {
    console.info('FACEBOOK_AUTH_START', {
      has_session: Boolean(req.session),
      callback_url: getFacebookAuthAvailability().callback_url,
    });
    next();
  },
  (req, res, next) => {
    const authenticate = passport.authenticate('facebook', { scope: FACEBOOK_OAUTH_SCOPES, session: false });
    const handleError = (error) => {
      if (!error) return next();
      console.error('FACEBOOK_CALLBACK_FAILED', {
        reason_code: 'FACEBOOK_AUTH_START_FAILED',
        name: String(error?.name || 'OAuthError').slice(0, 80),
      });
      return redirectToOAuthError(res, 'facebook_failed', {
        provider: 'facebook',
        reason: getSafeProviderFailureReason(error),
      });
    };
    try {
      console.info('FACEBOOK_AUTH_REDIRECT_CREATED');
      return authenticate(req, res, handleError);
    } catch (error) {
      return handleError(error);
    }
  }
);
router.get('/facebook/callback',
  ensureOAuthProviderConfigured('facebook'),
  handleOAuthProviderResponseError('facebook'),
  completeOAuthAuthentication('facebook'),
  facebookOAuthCallback
);

// ─── Protected routes ──────────────────────────────────────────────
router.post('/logout', authenticateToken, logout);
router.get('/profile/optional', authenticateOptional, (req, res) => {
  if (!req.user) return res.status(204).end();
  return getProfile(req, res);
});
router.get('/me', authenticateToken, getProfile);
router.get('/profile', authenticateToken, getProfile);
router.get('/permissions', authenticateToken, getMyPermissions);
router.put('/change-password',
  authenticateToken,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
    .withMessage('Password must be at least 8 characters and include uppercase, lowercase, number, and special character'),
  validate,
  changePassword
);

// ─── 2FA ───────────────────────────────────────────────────────────
router.post(
  '/2fa/setup',
  authenticateToken,
  body('password').optional({ nullable: true }).isString().withMessage('Password confirmation is invalid'),
  validate,
  setup2FA
);
router.post('/2fa/verify', authenticateToken, body('totp_code').notEmpty(), validate, verify2FA);
router.delete(
  '/2fa',
  authenticateToken,
  body('password').optional({ nullable: true }).isString().withMessage('Password confirmation is invalid'),
  validate,
  disable2FA
);

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
  validateVerifyEmailRequest,
  verifyEmailToken
);

export default router;
