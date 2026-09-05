import { resolveFrontendOrigin } from '../config/frontend.js';

const REASONS = new Set(['state_mismatch', 'profile_missing_email', 'email_not_verified',
  'user_create_failed', 'account_link_failed', 'session_save_failed', 'callback_failed',
  'access_denied', 'not_configured', 'invalid_client', 'redirect_uri_mismatch', 'account_deactivated']);

export function redirectOAuthResult(res, provider, reason = null) {
  const safeProvider = provider === 'facebook' ? 'facebook' : 'google';
  const params = new URLSearchParams({ provider: safeProvider, status: reason ? 'failed' : 'success' });
  if (reason) params.set('reason', REASONS.has(reason) ? reason : 'callback_failed');
  const url = `${resolveFrontendOrigin()}/#/oauth-callback?${params}`;
  if (reason && safeProvider === 'facebook') console.warn('FACEBOOK_CALLBACK_FAILED_REASON', { reason: params.get('reason') });
  console.info('OAUTH_FRONTEND_REDIRECT_FULL_URL', { url });
  return res.redirect(url);
}
