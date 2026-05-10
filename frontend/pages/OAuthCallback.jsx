import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { exchangeOAuthCode } from '../services/api';

const OAUTH_ERROR_MESSAGES = {
  access_denied: 'Google sign in was cancelled.',
  account_deactivated: 'This account is deactivated. Please contact support.',
  google_not_configured: 'Google sign in is not available right now.',
  google_failed: 'Google sign in failed. Please try again.',
  oauth_missing_email: 'Google did not return a verified email address. Please use another Google account or sign in with email.',
  oauth_failed: 'Authentication failed. Please try again.',
};

const getOAuthErrorMessage = (error) => {
  const normalized = String(error || '').trim();
  return OAUTH_ERROR_MESSAGES[normalized] || normalized || OAUTH_ERROR_MESSAGES.oauth_failed;
};

const clearOAuthCallbackQuery = () => {
  const hashPath = (window.location.hash || '#/oauth-callback').split('?')[0] || '#/oauth-callback';
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${hashPath}`);
};

const OAuthCallback = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [displayError, setDisplayError] = useState('');

  useEffect(() => {
    if (handledRef.current) return undefined;
    handledRef.current = true;

    const code = searchParams.get('code');
    const error = searchParams.get('error');
    let cancelled = false;

    if (error) {
      navigate(`/login?error=${encodeURIComponent(getOAuthErrorMessage(error))}`, { replace: true });
      return () => { cancelled = true; };
    }

    if (code) {
      clearOAuthCallbackQuery();

      exchangeOAuthCode(code)
        .then((data) => {
          if (cancelled) return;
          if (!data?.user || !data?.token) {
            throw new Error('Authentication failed. Please try again.');
          }
          onLogin(data.user, data.token);
          navigate('/', { replace: true });
        })
        .catch((err) => {
          if (cancelled) return;
          const message = err?.message || 'Authentication failed. Please try again.';
          setDisplayError(message);
          navigate(`/login?error=${encodeURIComponent(message)}`, { replace: true });
        });
    } else {
      navigate(`/login?error=${encodeURIComponent('Authentication failed. Missing OAuth verification code.')}`, { replace: true });
    }

    return () => { cancelled = true; };
  }, [searchParams, navigate, onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400">Completing sign in...</p>
        {displayError && <p className="text-sm text-red-400 mt-3">{displayError}</p>}
      </div>
    </div>
  );
};

export default OAuthCallback;
