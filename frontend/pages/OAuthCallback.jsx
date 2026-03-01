import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getProfile } from '../services/api';

const OAuthCallback = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    if (token) {
      // Store token temporarily, then fetch user profile securely via API
      localStorage.setItem('shopCoreToken', token);
      // Remove token from URL to prevent leaks via referrer/history
      window.history.replaceState({}, document.title, window.location.pathname);

      getProfile().then(user => {
        onLogin(user, token);
        navigate('/');
      }).catch(() => {
        localStorage.removeItem('shopCoreToken');
        navigate('/login?error=Authentication failed');
      });
    } else {
      navigate('/login?error=Authentication failed');
    }
  }, [searchParams, navigate, onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Completing sign in...</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
