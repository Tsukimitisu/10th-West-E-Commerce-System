export const SESSION_REFRESH_MESSAGE = 'OAuth login completed, but session refresh failed. Please sign in again.';

// One bounded recovery attempt; never downgrade a failed profile to a fake login.
export async function refreshOAuthProfile({ getProfile, delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)), log = () => {} }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    log('OAUTH_PROFILE_REFRESH_START');
    try {
      const user = await getProfile();
      if (!user?.id) throw Object.assign(new Error(SESSION_REFRESH_MESSAGE), { status: 401 });
      log('OAUTH_PROFILE_REFRESH_SUCCESS');
      return user;
    } catch (error) {
      const status = Number(error?.status) || null;
      if (attempt === 0 && (status === 401 || status === null || status >= 500)) {
        log('OAUTH_PROFILE_REFRESH_RETRY', { status });
        await delay(500);
        continue;
      }
      log('OAUTH_PROFILE_REFRESH_FAILED', { status });
      throw Object.assign(new Error(SESSION_REFRESH_MESSAGE), { code: 'oauth_session_failed', status });
    }
  }
}

export function oauthDestination(user, requested) {
  const dashboard = { owner: '/admin/dashboard', admin: '/admin/dashboard', store_staff: '/staff/dashboard',
    super_admin: '/superadmin/dashboard', cashier: '/pos' }[user.role];
  if (dashboard) return dashboard;
  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//')
    || /[\\\r\n]/.test(requested) || /^\/(?:login|register|oauth-callback)(?:[/?#]|$)/.test(requested)
    || /[?&](?:google|facebook|error)=/.test(requested)) return '/';
  return requested;
}

export function clearOAuthErrors(storages) {
  for (const storage of storages) {
    for (const key of ['oauth_error', 'auth_error', 'google_error', 'facebook_error', 'google_failed', 'facebook_failed']) {
      try { storage?.removeItem(key); } catch { /* Storage blocking must not prevent cookie login. */ }
    }
  }
}
