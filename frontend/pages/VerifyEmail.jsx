import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader, Mail } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail } from '../services/api';

const VERIFY_REQUEST_CACHE_MS = 30 * 1000;
const verifyRequestCache = new Map();

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

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [email, setEmail] = useState('');
  const [nextRoute, setNextRoute] = useState('/');
  const [resendStatus, setResendStatus] = useState('');
  const [isResending, setIsResending] = useState(false);
  const redirectTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const runVerification = async () => {
      const normalizedToken = String(token || '').trim();
      if (!normalizedToken) {
        setStatus('error');
        setMessage('Verification token is missing. Please use the latest link from your email.');
        return;
      }

      setStatus('loading');
      setMessage('Verifying your email...');

      try {
        const result = await verifyTokenOnce(normalizedToken);
        if (cancelled) return;

        setStatus('success');

        if (result?.token && result?.user && onLogin) {
          const destination = getPostVerifyRedirect(result.user);
          setNextRoute(destination);
          setMessage(result?.message || 'Your account has been successfully verified. Logging you in...');
          onLogin(result.user, result.token);
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

        setStatus('error');

        if (code === 'VERIFICATION_TOKEN_EXPIRED') {
          setMessage('This verification link has expired. Enter your email below and we will send a new one.');
          if (err?.email) setEmail(String(err.email).trim().toLowerCase());
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
  }, [navigate, onLogin, token]);

  const handleResend = async (e) => {
    e.preventDefault();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return;

    setIsResending(true);
    setResendStatus('');

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
            <h2 className="text-xl font-bold text-white mb-2">Verifying your email...</h2>
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

            <div className="w-full bg-gray-900 border border-gray-700 rounded-lg p-5 mb-6 text-left">
              <h3 className="text-sm font-bold text-white mb-3">Need a new verification email?</h3>
              <form onSubmit={handleResend} className="flex flex-col gap-3">
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (resendStatus) setResendStatus('');
                    }}
                    placeholder="Enter your registered email"
                    required
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
                {resendStatus && (
                  <p className={`text-xs ${resendStatus.toLowerCase().includes('success') ? 'text-green-400' : 'text-red-400'}`}>
                    {resendStatus}
                  </p>
                )}
              </form>
            </div>

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
