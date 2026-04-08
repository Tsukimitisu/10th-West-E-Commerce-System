import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader, Mail } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail, confirmEmailChangeToken } from '../services/api';

const VERIFY_REQUEST_CACHE_MS = 30 * 1000;
const VERIFY_REQUEST_TIMEOUT_MS = 8000;
const verifyRequestCache = new Map();
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const AUTH_VERIFIED_STORAGE_KEY = 'auth_verified';

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

const verifyTokenOnce = (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    const tokenError = new Error('Invalid verification link.');
    tokenError.code = 'VERIFICATION_TOKEN_INVALID';
    return Promise.reject(tokenError);
  }

  const cachedRequest = verifyRequestCache.get(normalizedToken);
  if (cachedRequest) return cachedRequest;

  const request = withVerificationTimeout(verifyEmailToken(normalizedToken))
    .then((result) => {
      window.setTimeout(() => {
        verifyRequestCache.delete(normalizedToken);
      }, VERIFY_REQUEST_CACHE_MS);
      return result;
    })
    .catch((error) => {
      verifyRequestCache.delete(normalizedToken);
      throw error;
    });

  verifyRequestCache.set(normalizedToken, request);
  return request;
};

const confirmEmailChangeOnce = (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    const tokenError = new Error('Invalid email change link.');
    tokenError.code = 'EMAIL_CHANGE_TOKEN_INVALID';
    return Promise.reject(tokenError);
  }

  const cacheKey = `email-change:${normalizedToken}`;
  const cachedRequest = verifyRequestCache.get(cacheKey);
  if (cachedRequest) return cachedRequest;

  const request = withVerificationTimeout(confirmEmailChangeToken(normalizedToken))
    .then((result) => {
      window.setTimeout(() => {
        verifyRequestCache.delete(cacheKey);
      }, VERIFY_REQUEST_CACHE_MS);
      return result;
    })
    .catch((error) => {
      verifyRequestCache.delete(cacheKey);
      throw error;
    });

  verifyRequestCache.set(cacheKey, request);
  return request;
};

const publishAuthVerifiedSignal = (user = null) => {
  if (typeof window === 'undefined') return;

  const payload = {
    verified: true,
    userId: Number(user?.id || 0) || null,
    at: Date.now(),
    source: 'verify-email',
  };

  try {
    window.localStorage.setItem(AUTH_VERIFIED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best effort only.
  }

  window.dispatchEvent(new CustomEvent('auth:verified', { detail: payload }));
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

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const emailChangeToken = searchParams.get('emailChangeToken');
  const isEmailChangeFlow = Boolean(String(emailChangeToken || '').trim());
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying...');
  const [email, setEmail] = useState('');
  const [nextRoute, setNextRoute] = useState('/');
  const [resendStatus, setResendStatus] = useState('');
  const [resendError, setResendError] = useState('');
  const [isResending, setIsResending] = useState(false);
  const redirectTimeoutRef = useRef(null);
  const lastProcessedTokenRef = useRef('');
  const onLoginRef = useRef(onLogin);

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

  useEffect(() => {
    let cancelled = false;

    const runVerification = async () => {
      const normalizedEmailChangeToken = String(emailChangeToken || '').trim();
      const normalizedToken = String(token || '').trim();
      const activeToken = normalizedEmailChangeToken || normalizedToken;

      if (!activeToken) {
        if (lastProcessedTokenRef.current) return;

        setStatus('error');
        setMessage('Verification token is missing. Please use the latest link from your email.');
        return;
      }

      if (lastProcessedTokenRef.current === activeToken) {
        return;
      }
      lastProcessedTokenRef.current = activeToken;

      setStatus('loading');
      setMessage(normalizedEmailChangeToken ? 'Confirming your new email address...' : 'Verifying...');

      try {
        const result = normalizedEmailChangeToken
          ? await confirmEmailChangeOnce(normalizedEmailChangeToken)
          : await verifyTokenOnce(normalizedToken);

        if (cancelled) return;

        setStatus('success');
        clearVerificationTokenFromUrl();

        if (normalizedEmailChangeToken) {
          try {
            const existingUser = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
            if (existingUser && result?.user && Number(existingUser.id) === Number(result.user.id)) {
              localStorage.setItem('shopCoreUser', JSON.stringify({ ...existingUser, ...result.user }));
              window.dispatchEvent(new Event('auth:changed'));
            }
          } catch {
            // Ignore local cache merge failures.
          }

          const destination = localStorage.getItem('shopCoreToken') ? '/profile' : '/login';
          setNextRoute(destination);
          setMessage(result?.message || 'Your email address has been updated successfully.');
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) navigateRef.current(destination, { replace: true });
          }, 1200);
          return;
        }

        if (result?.autoLogin && result?.token && result?.user && onLoginRef.current) {
          const destination = getVerificationRedirect(result);
          setNextRoute(destination);
          setMessage('Email verified successfully. Logging you in...');

          onLoginRef.current(result.user, result.token);
          publishAuthVerifiedSignal(result.user);
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) navigateRef.current(destination, { replace: true });
          }, 1000);
          return;
        }

        if (result?.autoLogin && result?.token && result?.user) {
          const destination = getVerificationRedirect(result);
          setNextRoute(destination);
          setMessage('Email verified successfully. Logging you in...');

          try {
            localStorage.setItem('shopCoreUser', JSON.stringify(result.user));
            localStorage.setItem('shopCoreToken', result.token);
            window.dispatchEvent(new Event('auth:changed'));
          } catch {
            // Ignore storage sync failures.
          }

          publishAuthVerifiedSignal(result.user);
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) navigateRef.current(destination, { replace: true });
          }, 1000);
          return;
        }

        setStatus('error');
        setNextRoute('/login');
        setMessage('Verification succeeded, but automatic sign-in was not completed. Please try the link again.');
      } catch (err) {
        if (cancelled) return;

        const code = String(err?.code || '').toUpperCase();
        const fieldTokenError = String(err?.fieldErrors?.token || '').trim();
        const fallbackMessage = fieldTokenError || String(err?.message || 'Invalid or expired verification link.');

        try {
          const savedUser = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
          if (
            savedUser?.id &&
            savedUser?.email_verified &&
            code !== 'VERIFICATION_TOKEN_USED' &&
            code !== 'VERIFICATION_TOKEN_INVALID' &&
            code !== 'VERIFICATION_TOKEN_EXPIRED'
          ) {
            const destination = getPostVerifyRedirect(savedUser);
            setStatus('success');
            setNextRoute(destination);
            setMessage('Account already verified. Redirecting...');
            redirectTimeoutRef.current = window.setTimeout(() => {
              if (!cancelled) navigateRef.current(destination, { replace: true });
            }, 900);
            return;
          }
        } catch {
          // Ignore local cache parse issues.
        }

        setStatus('error');

        if (code === 'VERIFICATION_TOKEN_EXPIRED') {
          setMessage('Verification link expired. Please request a new one.');
          if (err?.email) setEmail(String(err.email).trim().toLowerCase());
          return;
        }

        if (code === 'EMAIL_CHANGE_TOKEN_EXPIRED') {
          setMessage('This email change link has expired. Update your profile again to request a new link.');
          return;
        }

        if (code === 'EMAIL_CHANGE_TOKEN_INVALID' || code === 'EMAIL_CHANGE_NOT_PENDING') {
          setMessage('This email change link is invalid or already used.');
          return;
        }

        if (code === 'VERIFICATION_TOKEN_INVALID') {
          setMessage('Invalid verification link.');
          return;
        }

        if (code === 'VERIFICATION_TOKEN_USED') {
          setMessage('This verification link has already been used. Please log in or request a new one.');
          return;
        }

        if (code === 'VERIFICATION_TOKEN_REQUIRED') {
          setMessage('Verification token is missing. Please use the latest link from your email.');
          return;
        }

        if (code === 'VERIFICATION_TIMEOUT' || code === 'VERIFICATION_TEMPORARY_FAILURE') {
          setMessage('Verification is taking too long. Please try again.');
          return;
        }

        if (code === 'VERIFICATION_NETWORK_ERROR' || code === 'NETWORK_ERROR') {
          setMessage('We could not reach the server. Please check your connection and try again.');
          return;
        }

        setMessage(fallbackMessage);
      }
    };

    runVerification();

    return () => {
      cancelled = true;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, [token, emailChangeToken]);

  const handleResend = async (e) => {
    e.preventDefault();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const nextResendError = validateResendEmail(normalizedEmail);
    if (nextResendError) {
      setResendError(nextResendError);
      setResendStatus('');
      return;
    }

    setIsResending(true);
    setResendStatus('');
    setResendError('');

    try {
      await resendVerificationEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setResendStatus('Verification email resent successfully. Please check your inbox.');
    } catch (err) {
      setResendStatus(err.message || 'Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-8 text-center flex flex-col items-center">
        {status === 'loading' && (
          <>
            <Loader className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">{isEmailChangeFlow ? 'Confirming your email change...' : 'Verifying...'}</h2>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
              <Check size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Email Verified</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            <Link
              to={nextRoute}
              className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
            >
              Continue
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
              <X size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Verification Failed</h2>
            <p className="text-gray-400 mb-6">{message}</p>

            {!isEmailChangeFlow && (
              <div className="w-full bg-gray-900 border border-gray-700 rounded-lg p-5 mb-6 text-left">
                <h3 className="text-sm font-bold text-white mb-3">Need a new verification email?</h3>
                <form onSubmit={handleResend} noValidate className="flex flex-col gap-3">
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
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
                      className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isResending}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    {isResending ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                  {resendError && (
                    <p id="resend-email-error" className="text-xs text-red-400">{resendError}</p>
                  )}
                  {resendStatus && (
                    <p className={`text-xs ${resendStatus.toLowerCase().includes('success') ? 'text-green-400' : 'text-red-400'}`}>
                      {resendStatus}
                    </p>
                  )}
                </form>
              </div>
            )}

            <Link
              to="/login"
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
            >
              Return to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
