import BrandMark from '../components/ui/BrandMark';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail, confirmEmailChangeToken } from '../services/api';
import { getCurrentAuthUser, requestAuthRefresh, setCurrentAuthUser } from '../services/authSession';

const VERIFY_REQUEST_TIMEOUT_MS = 8000;
const VERIFICATION_LOADING_MESSAGE = 'Verifying...';
const VERIFICATION_SUCCESS_MESSAGE = 'Email verified successfully. Logging you in...';
const VERIFICATION_FAILED_MESSAGE = 'Verification failed';
const VERIFICATION_EXPIRED_MESSAGE = 'This verification link expired. Request a new one below.';
const VERIFICATION_INVALID_MESSAGE = 'This verification link is invalid. Request a new one below.';
const VERIFICATION_USED_MESSAGE = 'This verification link was already used. Request a new one below.';
const VERIFICATION_ALREADY_VERIFIED_MESSAGE = 'This email is already verified. Redirecting you to login...';
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const AUTH_VERIFIED_STORAGE_KEY = 'auth_verified';
const VERIFY_REQUEST_CACHE_MS = 30000;
const verificationRequestCache = new Map();

const getPostVerifyRedirect = (user) => {
  const role = String(user?.role || '').toLowerCase();

  if (role === 'super_admin') return '/super-admin';
  if (role === 'owner' || role === 'admin' || role === 'store_staff') return '/admin';

  return '/';
};

const getVerificationRedirect = (result) => {
  const explicitRedirect = String(result?.redirectTo || '').trim();
  if (explicitRedirect) return explicitRedirect;
  return getPostVerifyRedirect(result?.user);
};

const buildLoginRedirect = (message, extraParams = {}) => {
  const params = new URLSearchParams(extraParams);
  if (message) params.set('message', message);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
};

const publishAuthVerifiedSignal = (user = null) => {
  if (typeof window === 'undefined') return;

  try {
    // Reset the flag first so repeated verifications still trigger a storage event in other tabs.
    window.localStorage.removeItem(AUTH_VERIFIED_STORAGE_KEY);
    window.localStorage.setItem(AUTH_VERIFIED_STORAGE_KEY, 'true');
  } catch {
    // Best effort only.
  }

  window.dispatchEvent(new CustomEvent('auth:verified', {
    detail: {
      verified: true,
      userId: Number(user?.id || 0) || null,
      at: Date.now(),
      source: 'verify-email',
    },
  }));
  requestAuthRefresh();
};

const createVerificationTimeoutError = () => {
  const timeoutError = new Error('Verification is taking longer than expected. Please try again.');
  timeoutError.code = 'VERIFICATION_TIMEOUT';
  return timeoutError;
};

const withVerificationTimeout = (promise, timeoutMs = VERIFY_REQUEST_TIMEOUT_MS) => (
  new Promise((resolve, reject) => {
    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(createVerificationTimeoutError());
    }, timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        reject(error);
      });
  })
);

const createVerificationRequiredError = () => {
  const error = new Error('Verification token is required.');
  error.code = 'VERIFICATION_TOKEN_REQUIRED';
  return error;
};

const getCachedVerificationRequest = (cacheKey, factory) => {
  const existingRequest = verificationRequestCache.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = Promise.resolve()
    .then(factory)
    .finally(() => {
      window.setTimeout(() => {
        verificationRequestCache.delete(cacheKey);
      }, VERIFY_REQUEST_CACHE_MS);
    });

  verificationRequestCache.set(cacheKey, request);
  return request;
};

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const emailChangeToken = searchParams.get('emailChangeToken');
  const isEmailChangeFlow = Boolean(String(emailChangeToken || '').trim());
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState(VERIFICATION_LOADING_MESSAGE);
  const [email, setEmail] = useState('');
  const [nextRoute, setNextRoute] = useState('/');
  const [resendStatus, setResendStatus] = useState('');
  const [resendError, setResendError] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSucceeded, setResendSucceeded] = useState(false);
  const redirectTimeoutRef = useRef(null);
  const hasAttemptedVerificationRef = useRef(false);
  const onLoginRef = useRef(onLogin);
  const resendInFlightRef = useRef(false);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    onLoginRef.current = onLogin;
  }, [onLogin]);

  const validateResendEmail = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'Enter your registered email to resend the verification link.';
    if (!EMAIL_REGEX.test(normalized)) return 'Use a valid email format like name@example.com.';
    return '';
  };

  const clearVerificationTokenFromUrl = () => {
    if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return;
    window.history.replaceState(null, '', '/#/verify-email');
  };

  const navigateWithFallback = (destination, { replace = true } = {}) => {
    if (typeof window === 'undefined') return;

    try {
      navigateRef.current(destination, { replace });
      return;
    } catch {
      // Fall back to a hard hash redirect when the current effect instance was remounted.
    }

    const normalized = String(destination || '/').trim() || '/';
    const hashTarget = normalized.startsWith('#')
      ? normalized
      : `#${normalized.startsWith('/') ? normalized : `/${normalized}`}`;

    window.location.hash = hashTarget;
  };

  const redirectToLoginWithMessage = (message, extraParams = {}, delayMs = 1200, cancelled = false) => {
    const destination = buildLoginRedirect(message, extraParams);
    if (!cancelled) {
      setStatus('success');
      setNextRoute(destination);
      setMessage(message);
    }
    redirectTimeoutRef.current = window.setTimeout(() => {
      navigateWithFallback(destination, { replace: true });
    }, delayMs);
  };

  const finalizeAuthenticatedLogin = (user, destination, cancelled) => {
    setCurrentAuthUser(user);
    if (onLoginRef.current) {
      try {
        onLoginRef.current(user);
      } catch {
        // Fall through to the redirect. Session state was already updated.
      }
    }

    publishAuthVerifiedSignal(user);
    if (!cancelled) {
      setStatus('success');
      setNextRoute(destination);
      setMessage(VERIFICATION_SUCCESS_MESSAGE);
    }
    clearVerificationTokenFromUrl();
    redirectTimeoutRef.current = window.setTimeout(() => {
      navigateWithFallback(destination, { replace: true });
    }, 1000);
  };

  useEffect(() => {
    let cancelled = false;

    const runVerification = async () => {
      if (hasAttemptedVerificationRef.current) return;
      hasAttemptedVerificationRef.current = true;

      const normalizedEmailChangeToken = String(emailChangeToken || '').trim();
      const normalizedToken = String(token || '').trim();
      const activeToken = normalizedEmailChangeToken || normalizedToken;

      if (!activeToken) {
        setStatus('error');
        setMessage(VERIFICATION_INVALID_MESSAGE);
        return;
      }

      setStatus('loading');
      setMessage(VERIFICATION_LOADING_MESSAGE);

      try {
        const cacheKey = normalizedEmailChangeToken
          ? `email-change:${normalizedEmailChangeToken}`
          : `verify:${normalizedToken}`;
        const result = await getCachedVerificationRequest(cacheKey, () => withVerificationTimeout(
          normalizedEmailChangeToken
            ? confirmEmailChangeToken(normalizedEmailChangeToken)
            : (normalizedToken ? verifyEmailToken(normalizedToken) : Promise.reject(createVerificationRequiredError()))
        ));

        if (normalizedEmailChangeToken) {
          const existingUser = getCurrentAuthUser();
          if (existingUser && result?.user && Number(existingUser.id) === Number(result.user.id)) {
            setCurrentAuthUser({ ...existingUser, ...result.user });
          }

          const destination = existingUser ? '/profile' : '/login';
          if (!cancelled) {
            setStatus('success');
            setNextRoute(destination);
            setMessage(VERIFICATION_SUCCESS_MESSAGE);
          }
          clearVerificationTokenFromUrl();
          redirectTimeoutRef.current = window.setTimeout(() => {
            navigateWithFallback(destination, { replace: true });
          }, 1200);
          return;
        }

        if (result?.alreadyVerified) {
          redirectToLoginWithMessage(VERIFICATION_ALREADY_VERIFIED_MESSAGE, { verified: '1' }, 1200, cancelled);
          return;
        }

        if (result?.autoLogin && result?.user) {
          const destination = getVerificationRedirect(result);
          finalizeAuthenticatedLogin(result.user, destination, cancelled);
          return;
        }

        redirectToLoginWithMessage('Email verified successfully. Please sign in to continue.', { verified: '1' }, 1200, cancelled);
        return;
      } catch (err) {
        const code = String(err?.code || '').toUpperCase();
        if (!cancelled) {
          setStatus('error');
        }

        if (code === 'VERIFICATION_TOKEN_EXPIRED') {
          if (!cancelled) {
            setMessage(VERIFICATION_EXPIRED_MESSAGE);
            if (err?.email) setEmail(String(err.email).trim().toLowerCase());
          }
          return;
        }

        if (code === 'EMAIL_CHANGE_TOKEN_EXPIRED') {
          if (!cancelled) setMessage(VERIFICATION_FAILED_MESSAGE);
          return;
        }

        if (code === 'EMAIL_CHANGE_TOKEN_INVALID' || code === 'EMAIL_CHANGE_NOT_PENDING') {
          if (!cancelled) setMessage(VERIFICATION_FAILED_MESSAGE);
          return;
        }

        if (code === 'VERIFICATION_TOKEN_INVALID') {
          if (!cancelled) setMessage(VERIFICATION_INVALID_MESSAGE);
          return;
        }

        if (code === 'VERIFICATION_TOKEN_USED') {
          redirectToLoginWithMessage(VERIFICATION_ALREADY_VERIFIED_MESSAGE, { verified: '1' }, 1200, cancelled);
          return;
        }

        if (code === 'VERIFICATION_ALREADY_VERIFIED') {
          redirectToLoginWithMessage(VERIFICATION_ALREADY_VERIFIED_MESSAGE, { verified: '1' }, 1200, cancelled);
          return;
        }

        if (code === 'VERIFICATION_TOKEN_REQUIRED') {
          if (!cancelled) setMessage(VERIFICATION_INVALID_MESSAGE);
          return;
        }

        if (code === 'VERIFICATION_TIMEOUT' || code === 'VERIFICATION_TEMPORARY_FAILURE') {
          if (!cancelled) setMessage(VERIFICATION_FAILED_MESSAGE);
          return;
        }

        if (code === 'VERIFICATION_NETWORK_ERROR' || code === 'NETWORK_ERROR') {
          if (!cancelled) setMessage(VERIFICATION_FAILED_MESSAGE);
          return;
        }

        if (!cancelled) setMessage(VERIFICATION_FAILED_MESSAGE);
      }
    };

    void runVerification();

    return () => {
      cancelled = true;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, [token, emailChangeToken]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (resendInFlightRef.current) return;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const nextResendError = validateResendEmail(normalizedEmail);
    if (nextResendError) {
      setResendError(nextResendError);
      setResendStatus('');
      return;
    }

    resendInFlightRef.current = true;
    setIsResending(true);
    setResendStatus('');
    setResendError('');
    setResendSucceeded(false);

    try {
      await resendVerificationEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setResendSucceeded(true);
      setResendStatus('Verification email request accepted. Check your inbox and spam folder.');
    } catch {
      setResendStatus('We could not send the verification email right now. Please try again shortly.');
    } finally {
      resendInFlightRef.current = false;
      setIsResending(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-content text-center" role="status" aria-live="polite">
        <BrandMark compact className="mb-6 justify-center" />
        {status === 'loading' && (
          <>
            <Loader className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <h1 className="font-display text-xl font-bold text-slate-950 mb-2">{VERIFICATION_LOADING_MESSAGE}</h1>
            <p className="text-sm text-slate-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
              <Check size={32} />
            </div>
            <h1 className="font-display text-xl font-bold text-slate-950 mb-2">Email verified</h1>
            <p className="text-sm text-slate-600 mb-4">{message}</p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader className="w-4 h-4 animate-spin" />
              <span>Redirecting...</span>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
              <X size={32} />
            </div>
            <h1 className="font-display text-xl font-bold text-slate-950 mb-2">Verification failed</h1>
            <p className="text-sm text-slate-600 mb-6">{message}</p>

            {!isEmailChangeFlow && (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 mb-6 text-left">
                <h2 className="text-sm font-bold text-slate-950 mb-3">Need a new verification email?</h2>
                <p className="text-xs text-gray-400 mb-3">Verification links expire in 1 to 3 minutes. Enter your email to send a fresh link.</p>
                <form onSubmit={handleResend} noValidate className="flex flex-col gap-3">
                  <div className="relative">
                    <label htmlFor="verification-resend-email" className="mb-1 block text-sm font-medium text-slate-700">Email address</label>
                    <input
                      id="verification-resend-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (resendError) setResendError('');
                        if (resendStatus) setResendStatus('');
                      }}
                      placeholder="Enter your registered email"
                      aria-invalid={resendError ? 'true' : 'false'}
                      aria-describedby={resendError ? 'resend-email-error' : undefined}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isResending}
                    className="min-h-11 w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {isResending ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                  {resendError && (
                    <p id="resend-email-error" role="alert" className="text-xs text-red-700">{resendError}</p>
                  )}
                  {resendStatus && (
                    <p className={`text-xs ${resendSucceeded ? 'text-green-400' : 'text-red-400'}`}>
                      {resendStatus}
                    </p>
                  )}
                </form>
              </div>
            )}

            <Link
              to="/login"
              className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Return to Login
            </Link>
          </>
        )}
      </div>
    </main>
  );
};

export default VerifyEmail;
