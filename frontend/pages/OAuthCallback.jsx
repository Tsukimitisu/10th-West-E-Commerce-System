import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { exchangeOAuthCode } from '../services/api';

const OAuthCallback = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    if (code) {
      // Remove code from URL after parsing to reduce leakage via referrer/history
      window.history.replaceState({}, document.title, window.location.pathname);

      exchangeOAuthCode(code)
        .then((data) => {
          onLogin(data.user, data.token);
          navigate('/');
        })
        .catch(() => {
          navigate('/login?error=Authentication failed');
        });
    } else {
      navigate('/login?error=Authentication failed');
    }
  }, [searchParams, navigate, onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
};

export default OAuthCallback;


