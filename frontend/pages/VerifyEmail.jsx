import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Check, X, Loader, Mail } from 'lucide-react';
import { verifyEmailToken, resendVerificationEmail } from '../services/api';

const VerifyEmail = ({ onLogin }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [isResending, setIsResending] = useState(false);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email) return;
    setIsResending(true);
    setResendStatus('');
    try {
      await resendVerificationEmail(email);
      setResendStatus('Verification email resent successfully! Please check your inbox.');
    } catch (err) {
      setResendStatus(err.message || 'Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async () => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing verification link.');
      return;
    }

    setStatus('loading');
    try {
      const res = await verifyEmailToken(token);
      setStatus('success');
      setMessage('Your account has been successfully verified. Logging you in...');
      if (res.token && res.user && onLogin) {
        setTimeout(() => {
          onLogin(res.user, res.token);
          navigate('/');
        }, 1500);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Invalid or expired verification link.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-8 text-center flex flex-col items-center">
        
        {status === 'idle' && (
          <>
            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <Mail size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Verify Your Account</h2>
            <p className="text-gray-400 mb-6">Click the button below to verify your email address and activate your account.</p>
            <button
              onClick={handleVerify}
              className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
            >
              Verify Account
            </button>
          </>
        )}

        {status === 'loading' && (
          <>
            <Loader className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Verifying your email...</h2>
            <p className="text-gray-400">Please wait while we verify your account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
              <Check size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Email Verified!</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            {!message.includes('Logging you in') && (
              <Link
                to="/login"
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
              >
                Go to Login
              </Link>
            )}
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
              <h3 className="text-sm font-bold text-white mb-3">Link expired? Get a new one</h3>
              <form onSubmit={handleResend} className="flex flex-col gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your registered email"
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white text-sm"
                />
                <button
                  type="submit"
                  disabled={isResending}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {isResending ? 'Sending...' : 'Resend Verification Email'}
                </button>
                {resendStatus && (
                  <p className={`text-xs mt-1 ${resendStatus.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
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
