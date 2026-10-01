import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { exchangeOAuthCode, getProfile, refreshCsrfAfterSessionRotation } from '../services/api';
import { refreshOAuthProfile, oauthDestination, clearOAuthErrors, SESSION_REFRESH_MESSAGE } from '../utils/oauthCompletion';

const trace = (event, details = {}) => console.info(event, details);

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

const FACEBOOK_ERROR_MESSAGES = {
  access_denied: 'Facebook sign in was cancelled.',
  facebook_not_configured: 'Facebook sign in is not available right now.',
  facebook_failed: 'Facebook sign in failed. Please try again.',
  oauth_invalid_state: 'The Facebook sign-in request expired or was invalid. Please try again.',
  oauth_missing_email: 'Facebook did not provide an email address. Please use email sign in.',
  oauth_account_conflict: 'This Facebook account cannot be linked automatically. Please use email sign in.',
  oauth_session_failed: 'Facebook sign in succeeded, but a secure session could not be created. Please try again.',
};

const getOAuthErrorMessage = (error, provider = 'google') => {
  const normalized = String(error || '').trim();
  if (provider === 'facebook' && FACEBOOK_ERROR_MESSAGES[normalized]) {
    return FACEBOOK_ERROR_MESSAGES[normalized];
  }
  return OAUTH_ERROR_MESSAGES[normalized] || OAUTH_ERROR_MESSAGES.oauth_failed;
};

const clearOAuthCallbackQuery = () => {
  const hashPath = (window.location.hash || '#/oauth-callback').split('?')[0] || '#/oauth-callback';
  window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${hashPath}`);
};

const withTimeout = (promise, milliseconds = 9000) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => {
    const error = new Error('oauth_timeout');
    error.code = 'oauth_timeout';
    reject(error);
  }, milliseconds);

  Promise.resolve(promise).then(
    (value) => {
      window.clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      window.clearTimeout(timer);
      reject(error);
    },
  );
});

const getCallbackFailureMessage = (error, provider, providerName) => {
  if (error?.code === 'oauth_timeout') {
    return `${providerName} sign in took too long. Please try again.`;
  }
  if (error?.code === 'oauth_session_failed') {
    return SESSION_REFRESH_MESSAGE;
  }
  return getOAuthErrorMessage(error?.code || 'oauth_failed', provider);
};

const getSafeReturnPath = (user) => {
  let requested;
  try {
    requested = sessionStorage.getItem('oauth_return_to');
    sessionStorage.removeItem('oauth_return_to');
    clearOAuthErrors([localStorage, sessionStorage]);
  } catch { /* Cookie login does not require browser storage. */ }
  return oauthDestination(user, requested);
};

const OAuthCallback = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const completionRef = useRef(null);
  const onLoginRef = useRef(onLogin);
  const [displayError, setDisplayError] = useState('');

  useEffect(() => {
    onLoginRef.current = onLogin;
  }, [onLogin]);

  useEffect(() => {
    const legacyCode = searchParams.get('code');
    const error = searchParams.get('error');
    const status = searchParams.get('status');
    const reason = searchParams.get('reason');
    const provider = searchParams.get('provider') === 'facebook' ? 'facebook' : 'google';
    const providerName = provider === 'facebook' ? 'Facebook' : 'Google';
    let cancelled = false;
    trace('OAUTH_CALLBACK_PAGE_LOADED');
    trace('OAUTH_CALLBACK_QUERY_PARAMS', { provider, status: status === 'failed' ? 'failed' : status === 'success' ? 'success' : 'pending' });

    if (error || status === 'failed') {
      clearOAuthCallbackQuery();
      const reasons = { state_mismatch: 'oauth_invalid_state', profile_missing_email: 'oauth_missing_email',
        email_not_verified: 'oauth_unverified_email', account_link_failed: 'oauth_account_conflict', session_save_failed: 'oauth_session_failed',
        account_deactivated: 'account_deactivated', access_denied: 'access_denied' };
      setDisplayError(getOAuthErrorMessage(error || reasons[reason] || `${provider}_failed`, provider));
      return () => { cancelled = true; };
    }

    // /profile is a safe GET and proves the rotated OAuth session immediately.
    // Do not block navigation on a CSRF refresh; authenticatedFetch already
    // refreshes and retries CSRF for the next state-changing request.
    // Share the operation across effect replay, but attach a fresh live listener.
    // Clearing router query state before completion can unmount this listener.
    if (!completionRef.current) {
      const completeLegacyExchange = legacyCode ? exchangeOAuthCode(legacyCode) : Promise.resolve();
      completionRef.current = withTimeout(completeLegacyExchange.then(() => refreshOAuthProfile({
        getProfile: () => getProfile({ oauthRefresh: true }), log: trace,
      })));
    }
    completionRef.current
      .then((user) => {
        if (cancelled) return;
        if (!user?.id) throw new Error(OAUTH_ERROR_MESSAGES.oauth_failed);
        onLoginRef.current(user);
        trace('OAUTH_AUTH_CONTEXT_UPDATED');
        void refreshCsrfAfterSessionRotation().catch(() => {});
        const returnPath = getSafeReturnPath(user);
        trace('OAUTH_REDIRECT_AFTER_SUCCESS');
        if (returnPath === '/') navigate('/', { replace: true });
        else navigate(returnPath, { replace: true });
      })
      .catch((callbackError) => {
        if (cancelled) return;
        clearOAuthCallbackQuery();
        setDisplayError(getCallbackFailureMessage(callbackError, provider, providerName));
      });

    return () => { cancelled = true; };
  }, [searchParams, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center" role="status" aria-live="polite">
        {!displayError && <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-red-500 border-t-transparent" />}
        {!displayError && <p className="text-sm text-slate-600">Completing secure {searchParams.get('provider') === 'facebook' ? 'Facebook' : 'Google'} sign in...</p>}
        {displayError && <p className="mt-3 text-sm text-red-600">{displayError}</p>}
        {displayError && <Link className="mt-4 inline-block text-sm font-semibold text-red-700 underline" to="/login">Back to login</Link>}
      </div>
    </main>
  );
};

export default OAuthCallback;
