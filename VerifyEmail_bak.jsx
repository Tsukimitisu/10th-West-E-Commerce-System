import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, X, Loader } from 'lucide-react';
import { verifyEmailToken } from '../services/api';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid or missing verification link.');
        return;
      }

      try {
        const res = await verifyEmailToken(token);
        setStatus('success');
        setMessage(res.message || 'Your account has been successfully verified. You may now log in.');
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Invalid or expired verification link.');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-8 text-center flex flex-col items-center">
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

