import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader, Mail } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail, confirmEmailChangeToken } from '../services/api';

const VERIFY_REQUEST_CACHE_MS = 30 * 1000;
const verifyRequestCache = new Map();
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const getPostVerifyRedirect = (user) => {
  const role = String(user?.role || '').toLowerCase();

  if (role === 'super_admin') return '/super-admin';
  if (role === 'owner' || role === 'admin' || role === 'store_staff') return '/admin';

  return '/';
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

  const request = verifyEmailToken(normalizedToken).finally(() => {
    window.setTimeout(() => {
      verifyRequestCache.delete(normalizedToken);
    }, VERIFY_REQUEST_CACHE_MS);
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

  const request = confirmEmailChangeToken(normalizedToken).finally(() => {
    window.setTimeout(() => {
      verifyRequestCache.delete(cacheKey);
    }, VERIFY_REQUEST_CACHE_MS);
  });

  verifyRequestCache.set(cacheKey, request);
  return request;
};

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const emailChangeToken = searchParams.get('emailChangeToken');
  const isEmailChangeFlow = Boolean(String(emailChangeToken || '').trim());
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [email, setEmail] = useState('');
  const [nextRoute, setNextRoute] = useState('/');
  const [resendStatus, setResendStatus] = useState('');
  const [resendError, setResendError] = useState('');
  const [isResending, setIsResending] = useState(false);
  const redirectTimeoutRef = useRef(null);
  const lastProcessedTokenRef = useRef('');
  const onLoginRef = useRef(onLogin);

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
        if (lastProcessedTokenRef.current) {
          return;
        }
        setStatus('error');
        setMessage('Verification token is missing. Please use the latest link from your email.');
        return;
      }

      if (lastProcessedTokenRef.current === activeToken) {
        return;
      }
      lastProcessedTokenRef.current = activeToken;

      setStatus('loading');
      setMessage(normalizedEmailChangeToken ? 'Confirming your new email address...' : 'Verifying your email...');

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
          } catch {}

          const destination = localStorage.getItem('shopCoreToken') ? '/profile' : '/login';
          setNextRoute(destination);
          setMessage(result?.message || 'Your email address has been updated successfully.');
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) navigate(destination, { replace: true });
          }, 1200);
          return;
        }

        if (result?.token && result?.user && onLoginRef.current) {
          const destination = getPostVerifyRedirect(result.user);
          setNextRoute(destination);
          setMessage(result?.message || 'Your account has been successfully verified. Logging you in...');
          onLoginRef.current(result.user, result.token);
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) navigate(destination, { replace: true });
          }, 1000);
          return;
        }

        setNextRoute('/login');
        setMessage(result?.message || 'Your account has been successfully verified. Please continue to login.');
        redirectTimeoutRef.current = window.setTimeout(() => {
          if (!cancelled) navigate('/login?verified=1', { replace: true });
        }, 1200);
      } catch (err) {
        if (cancelled) return;

        const code = String(err?.code || '').toUpperCase();
        const fieldTokenError = String(err?.fieldErrors?.token || '').trim();
        const fallbackMessage = fieldTokenError || String(err?.message || 'Invalid or expired verification link.');

        try {
          const savedUser = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
          if (savedUser?.id && savedUser?.email_verified) {
            const destination = getPostVerifyRedirect(savedUser);
            setStatus('success');
            setNextRoute(destination);
            setMessage('Your email is already verified. Redirecting...');
            redirectTimeoutRef.current = window.setTimeout(() => {
              if (!cancelled) navigate(destination, { replace: true });
            }, 900);
            return;
          }
        } catch {}

        setStatus('error');

        if (code === 'VERIFICATION_TOKEN_EXPIRED') {
          setMessage('This verification link has expired. Enter your email below and we will send a new one.');
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
          setMessage('This verification link is invalid. You can request a new one below.');
          return;
        }

        if (code === 'VERIFICATION_TOKEN_REQUIRED') {
          setMessage('Verification token is missing. Please use the latest link from your email.');
          return;
        }

        if (code === 'VERIFICATION_TIMEOUT' || code === 'VERIFICATION_TEMPORARY_FAILURE') {
          setMessage('Verification is taking longer than expected. Please try again in a moment.');
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
  }, [navigate, token, emailChangeToken]);

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
            <h2 className="text-xl font-bold text-white mb-2">{isEmailChangeFlow ? 'Confirming your email change...' : 'Verifying your email...'}</h2>
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
