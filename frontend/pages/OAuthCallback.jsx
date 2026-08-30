import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { exchangeOAuthCode, getProfile, refreshCsrfAfterSessionRotation } from '../services/api';

const OAUTH_ERROR_MESSAGES = {
  access_denied: 'Google sign in was cancelled.',
  account_deactivated: 'This account is deactivated. Please contact support.',
  google_not_configured: 'Google sign in is not available right now.',
  google_failed: 'Google sign in failed. Please try again.',
  oauth_invalid_state: 'The Google sign-in request expired or was invalid. Please try again.',
  oauth_missing_email: 'Google did not return an email address. Please use another Google account or sign in with email.',
  oauth_unverified_email: 'Google did not verify this email address. Please use another Google account or sign in with email.',
  oauth_account_conflict: 'This Google account cannot be linked automatically. Please contact support.',
  oauth_session_failed: 'Google sign in succeeded, but a secure session could not be created. Please try again.',
  oauth_failed: 'Authentication failed. Please try again.',
};

const getOAuthErrorMessage = (error) => {
  const normalized = String(error || '').trim();
  return OAUTH_ERROR_MESSAGES[normalized] || OAUTH_ERROR_MESSAGES.oauth_failed;
};

const clearOAuthCallbackQuery = () => {
  const hashPath = (window.location.hash || '#/oauth-callback').split('?')[0] || '#/oauth-callback';
  window.history.replaceState({}, document.title, `${window.location.pathname}${hashPath}`);
};

const withTimeout = (promise, milliseconds = 9000) => Promise.race([
  promise,
  new Promise((_, reject) => window.setTimeout(() => {
    const error = new Error('oauth_timeout');
    error.code = 'oauth_timeout';
    reject(error);
  }, milliseconds)),
]);

const getSafeReturnPath = () => {
  const requested = sessionStorage.getItem('oauth_return_to') || '/';
  sessionStorage.removeItem('oauth_return_to');
  return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
};

const OAuthCallback = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [displayError, setDisplayError] = useState('');

  useEffect(() => {
    if (handledRef.current) return undefined;
    handledRef.current = true;

    const legacyCode = searchParams.get('code');
    const error = searchParams.get('error');
    let cancelled = false;

    if (error) {
      clearOAuthCallbackQuery();
      setDisplayError(getOAuthErrorMessage(error));
      return () => { cancelled = true; };
    }

    clearOAuthCallbackQuery();

    const completeLegacyExchange = legacyCode
      ? exchangeOAuthCode(legacyCode)
      : Promise.resolve();

    withTimeout(completeLegacyExchange
      .then(() => refreshCsrfAfterSessionRotation())
      .then(() => getProfile()))
      .then((user) => {
        if (cancelled) return;
        if (!user?.id) throw new Error(OAUTH_ERROR_MESSAGES.oauth_failed);
        onLogin(user);
        const returnPath = getSafeReturnPath();
        if (returnPath === '/') navigate('/', { replace: true });
        else navigate(returnPath, { replace: true });
      })
      .catch((callbackError) => {
        if (cancelled) return;
        setDisplayError(callbackError?.code === 'oauth_timeout'
          ? 'Google sign in took too long. Please try again.'
          : getOAuthErrorMessage(callbackError?.code || 'oauth_failed'));
      });

    return () => { cancelled = true; };
  }, [searchParams, navigate, onLogin]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-red-500 border-t-transparent" />
        {!displayError && <p className="text-sm text-slate-600">Completing secure Google sign in...</p>}
        {displayError && <p className="mt-3 text-sm text-red-600">{displayError}</p>}
        {displayError && <Link className="mt-4 inline-block text-sm font-semibold text-red-700 underline" to="/login">Back to login</Link>}
      </div>
    </main>
  );
};

export default OAuthCallback;
