import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader, Mail } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail } from '../services/api';

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [email, setEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const runVerification = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid or expired verification link.');
        return;
      }

      setStatus('loading');
      setMessage('Verifying your email...');

      try {
        const result = await verifyEmailToken(token);
        if (cancelled) return;

        setStatus('success');
        setMessage('Your account has been successfully verified. Logging you in...');

        if (result.token && result.user && onLogin) {
          onLogin(result.user, result.token);
          window.setTimeout(() => {
            if (!cancelled) navigate('/');
          }, 1000);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err.message || 'Invalid or expired verification link.');
      }
    };

    runVerification();

    return () => {
      cancelled = true;
    };
  }, [navigate, onLogin, token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsResending(true);
    setResendStatus('');

    try {
      await resendVerificationEmail(email);
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
              to="/login"
              className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
            >
              Go to Login
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
                    onChange={(e) => setEmail(e.target.value)}
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
