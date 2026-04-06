import { Role, OrderStatus, ReturnStatus } from '../types.js';
import { supabase } from './supabase.js';
// Used only by custom Supabase fallback auth paths for secure password hashing.
import bcrypt from 'bcryptjs';

// Configuration
const API_URL = import.meta.env.VITE_API_URL || (() => {
  const host = window.location.hostname;
  return `http://${host}:5000/api`;
})();
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK === 'true';
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

const REGISTRATION_EMAIL_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const PROFILE_PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
const GMAIL_TYPO_DOMAINS = new Set([
  'gmai.com',
  'gmial.com',
  'gmail.co',
  'gmail.con',
  'gmail.cm',
  'gnail.com',
  'gmailcom',
]);

const getRegistrationEmailError = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) return 'Email is required.';
  if (!REGISTRATION_EMAIL_REGEX.test(normalized)) return 'Please enter a valid email address.';

  const domain = normalized.split('@')[1] || '';
  if (GMAIL_TYPO_DOMAINS.has(domain)) return 'Did you mean @gmail.com?';

  return '';
};

const normalizeProfilePhone = (value) => String(value || '').trim().replace(/[\s()-]/g, '');

const getProfilePhoneError = (value) => {
  const normalized = normalizeProfilePhone(value);
  if (!normalized) return '';
  if (normalized.length > 13) return 'Phone number must not exceed 13 characters.';
  if (!PROFILE_PHONE_REGEX.test(normalized)) return 'Enter a valid phone number (09XXXXXXXXX or +639XXXXXXXXX).';
  return '';
};

const toNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

// Helper function to get auth token
const getAuthToken = () => {
  return localStorage.getItem('shopCoreToken');
};

let csrfTokenCache = {
  token: '',
  expiresAt: 0,
};

const CSRF_META_NAME = 'csrf-token';

const setCsrfMetaToken = (token) => {
  if (typeof document === 'undefined') return;

  const normalized = String(token || '').trim();
  if (!normalized) return;

  let tag = document.querySelector(`meta[name="${CSRF_META_NAME}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', CSRF_META_NAME);
    document.head.appendChild(tag);
  }

  tag.setAttribute('content', normalized);
};

const getCsrfMetaToken = () => {
  if (typeof document === 'undefined') return '';
  const tag = document.querySelector(`meta[name="${CSRF_META_NAME}"]`);
  return String(tag?.getAttribute('content') || '').trim();
};

const isCsrfFailure = (status, responseBody = {}) => {
  const code = String(responseBody?.code || '').toUpperCase();
  const message = String(responseBody?.message || '').toLowerCase();
  return status === 403 && (code.startsWith('CSRF_') || message.includes('csrf'));
};

const getCookieValue = (name) => {
  if (typeof document === 'undefined') return '';
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

const getCsrfToken = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && csrfTokenCache.token && csrfTokenCache.expiresAt > now) {
    return csrfTokenCache.token;
  }

  if (!forceRefresh) {
    const metaToken = getCsrfMetaToken();
    if (metaToken) {
      csrfTokenCache = {
        token: metaToken,
        expiresAt: Date.now() + (15 * 60 * 1000),
      };
      return metaToken;
    }
  }

  try {
    const csrfRes = await fetch(`${API_URL}/csrf-token`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (csrfRes.ok) {
      const body = await csrfRes.json().catch(() => ({}));
      const csrfToken = String(body?.csrfToken || '').trim() || getCookieValue('csrf-token');
      if (csrfToken) {
        csrfTokenCache = {
          token: csrfToken,
          expiresAt: Date.now() + (55 * 60 * 1000),
        };
        setCsrfMetaToken(csrfToken);
        return csrfToken;
      }
    }
  } catch (error) {
    console.warn('Failed to refresh CSRF token:', error);
  }

  const cookieToken = getCookieValue('csrf-token');
  if (cookieToken) {
    csrfTokenCache = {
      token: cookieToken,
      expiresAt: Date.now() + (15 * 60 * 1000),
    };
    setCsrfMetaToken(cookieToken);
    return cookieToken;
  }

  return '';
};

export const ensureCsrfToken = async ({ forceRefresh = false } = {}) => getCsrfToken({ forceRefresh });

export const initializeSecurityContext = ({
  csrfRefreshMs = 15 * 60 * 1000,
  sessionTouchMs = 5 * 60 * 1000,
  activityWindowMs = 15 * 60 * 1000,
} = {}) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let disposed = false;
  let lastActivityAt = Date.now();
  let lastCsrfRefreshAt = 0;
  let lastSessionTouchAt = 0;

  const noteActivity = () => {
    lastActivityAt = Date.now();
  };

  const touchSession = async () => {
    try {
      await fetch(`${API_URL}/health`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // Intentionally ignore background keepalive failures.
    }
  };

  const refreshCsrf = async ({ force = false } = {}) => {
    try {
      await getCsrfToken({ forceRefresh: force });
      lastCsrfRefreshAt = Date.now();
    } catch {
      // Intentionally ignore background refresh failures.
    }
  };

  const heartbeat = async ({ force = false } = {}) => {
    if (disposed) return;
    const now = Date.now();
    if (!force && now - lastActivityAt > activityWindowMs) return;

    if (force || now - lastSessionTouchAt >= sessionTouchMs) {
      await touchSession();
      lastSessionTouchAt = Date.now();
    }

    if (force || now - lastCsrfRefreshAt >= csrfRefreshMs) {
      await refreshCsrf({ force });
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      noteActivity();
      heartbeat({ force: true });
    }
  };

  const handleFocus = () => {
    heartbeat({ force: true });
  };

  const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, noteActivity, { passive: true });
  });
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  heartbeat({ force: true });
  const intervalId = window.setInterval(() => {
    heartbeat();
  }, 60 * 1000);

  return () => {
    disposed = true;
    window.clearInterval(intervalId);
    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, noteActivity);
    });
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

const clearAuthSession = () => {
  localStorage.removeItem('shopCoreUser');
  localStorage.removeItem('shopCoreToken');
  window.dispatchEvent(new Event('auth:changed'));
};

const AUTH_FAILURE_CODES = new Set([
  'AUTH_TOKEN_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_ACCOUNT_DEACTIVATED',
]);

const isSessionAuthFailure = (status, responseBody = {}, token = '') => {
  const code = String(responseBody.code || '').toUpperCase();
  const isSupabaseToken = typeof token === 'string' && token.startsWith('sb-token-');
  if (code.startsWith('CSRF_')) return false;

  // Supabase fallback mode stores a local token shape (`sb-token-*`) that is not a backend JWT.
  // Treat backend AUTH_INVALID_TOKEN as a request-level error, not a global session-expiry event.
  if (isSupabaseToken && code === 'AUTH_INVALID_TOKEN') {
    return false;
  }

  if (AUTH_FAILURE_CODES.has(code)) {
    return true;
  }

  const message = String(responseBody.message || '').toLowerCase();
  if (!message || message.includes('csrf')) {
    return false;
  }

  const tokenHint = /(invalid|expired).{0,20}token|token.{0,20}(invalid|expired)/.test(message);
  const sessionHint = message.includes('session') && (message.includes('expired') || message.includes('revoked'));
  const reauthHint = message.includes('log in again') || message.includes('login again') || message.includes('access token required');
  const deactivatedHint = message.includes('account deactivated');

  if (isSupabaseToken && tokenHint) {
    return false;
  }

  if (status === 401) {
    return tokenHint || sessionHint || reauthHint || deactivatedHint;
  }

  if (status === 403) {
    return sessionHint || reauthHint || deactivatedHint || tokenHint;
  }

  return false;
};

// Helper: get current user info from token (for Supabase custom auth)
const getCurrentUserFromToken = () => {
  const token = getAuthToken();
  if (!token || !token.startsWith('sb-token-')) return null;
  try {
    return JSON.parse(atob(token.replace('sb-token-', '')));
  } catch {
    return null;
  }
};

// Helper: log staff activity to activity_logs table via Supabase
const logSupabaseActivity = async (action, entityType = null, entityId = null, details = null) => {
  try {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return;
    await supabase.from('activity_logs').insert({
      user_id: currentUser.id,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details: details || null,
    });
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
};

// Exported version for POS and other components
export const logPosActivity = logSupabaseActivity;

// Helper function to make authenticated requests (for backend API fallback)
const authenticatedFetch = async (url, options = {}) => {
  const {
    timeoutMs = 0,
    skipCsrf = false,
    ...requestOptions
  } = options;
  const token = getAuthToken();
  const headers = {
    ...(requestOptions.headers || {}),
  };
  const method = String(requestOptions.method || 'GET').toUpperCase();
  const isStateChangingMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const hasContentTypeHeader = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
  const hasCsrfHeader = Object.keys(headers).some((key) => key.toLowerCase() === 'x-csrf-token' || key.toLowerCase() === 'x-xsrf-token');
  const isFormDataBody = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;
  const isBlobBody = typeof Blob !== 'undefined' && requestOptions.body instanceof Blob;

  if (!hasContentTypeHeader && !isFormDataBody && !isBlobBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (isStateChangingMethod && !hasCsrfHeader && !skipCsrf) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

  const executeRequest = async (requestHeaders) => {
    const timeout = Number(timeoutMs);
    const shouldUseTimeout = Number.isFinite(timeout) && timeout > 0;
    const abortController = shouldUseTimeout && typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;
    let timeoutId = null;

    let signal = requestOptions.signal;
    if (abortController) {
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);

      if (signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any([signal, abortController.signal]);
      } else {
        signal = abortController.signal;
      }
    }

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers: requestHeaders,
        credentials: 'include',
        signal,
      });
      const responseBody = await response.json().catch(() => ({ message: 'Request failed' }));
      return { response, responseBody };
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        const timeoutError = new Error('Request timed out. Please try again.');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }

      const networkError = new Error('Unable to reach the server. Please check your connection and try again.');
      networkError.code = 'NETWORK_ERROR';
      throw networkError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  let { response, responseBody } = await executeRequest(headers);

  // Refresh and retry once when CSRF token is expired/invalid.
  if (isStateChangingMethod && !skipCsrf && isCsrfFailure(response.status, responseBody)) {
    const refreshedCsrf = await getCsrfToken({ forceRefresh: true });
    if (refreshedCsrf) {
      const retryHeaders = {
        ...headers,
        'x-csrf-token': refreshedCsrf,
      };
      const retryResult = await executeRequest(retryHeaders);
      response = retryResult.response;
      responseBody = retryResult.responseBody;
    }
  }

  if (!response.ok) {
    if (token && isSessionAuthFailure(response.status, responseBody, token)) {
      clearAuthSession();
      window.dispatchEvent(new Event('auth:session-expired'));
    }
    const apiError = new Error(responseBody.message || 'Request failed');
    Object.assign(apiError, responseBody, {
      status: response.status,
      fieldErrors: responseBody.fieldErrors || {},
    });
    throw apiError;
  }

  return responseBody;
};

// ==================== SUPABASE HELPERS ====================

const mapUserFromSupabase = (supabaseUser, profile) => ({
  id: profile?.id || parseInt(supabaseUser.id.replace(/-/g, '').substring(0, 8), 16),
  name: profile?.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
  email: supabaseUser.email || '',
  role: (profile?.role) || Role.CUSTOMER,
  phone: profile?.phone,
  avatar: profile?.avatar,
  store_credit: profile?.store_credit || 0,
  is_active: profile?.is_active ?? true,
  two_factor_enabled: profile?.two_factor_enabled || false,
  oauth_provider: supabaseUser.app_metadata?.provider || null,
  last_login: supabaseUser.last_sign_in_at,
  email_verified: supabaseUser.email_confirmed_at != null,
});

// ==================== AUTHENTICATION ====================

export const login = async (email, password, totp_code) => {
  if (USE_MOCK_DATA) {
    return loginMock(email, password);
  }

  if (USE_SUPABASE) {
    // Query the users table directly (custom auth, not Supabase Auth)
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) throw new Error('Invalid credentials');

    // Securely compare password using bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password_hash || '');

    if (!isValidPassword) throw new Error('Invalid credentials');

    if (!user.email_verified) {
      const err = new Error('Your account is not verified. Please check your email.');
      err.requiresVerification = true;
      err.email = user.email;
      err.code = 'EMAIL_NOT_VERIFIED';
      throw err;
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Generate a simple token for localStorage
    const token = 'sb-token-' + btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        store_credit: user.store_credit,
        is_active: user.is_active,
        last_login: user.last_login,
        email_verified: user.email_verified,
      },
      token,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password, totp_code }),
  });

  if (data.requires_2fa) {
    return { user: {}, token: '', requires_2fa: true };
  }

  return { user: data.user, token: data.token };
};

export const register = async (name, email, password, confirmPassword, consentData = {}, otp = '') => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedName = String(name || '').trim();

  const fieldErrors = {};
  const emailError = getRegistrationEmailError(normalizedEmail);

  if (!trimmedName) fieldErrors.name = 'Name is required.';
  if (emailError) fieldErrors.email = emailError;
  if (!password) fieldErrors.password = 'Password is required.';
  if (!confirmPassword) fieldErrors.confirmPassword = 'Please confirm your password.';
  if (password && confirmPassword && password !== confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    const validationError = new Error('Please correct the highlighted fields.');
    validationError.fieldErrors = fieldErrors;
    throw validationError;
  }

  if (USE_MOCK_DATA) {
    return registerMock(trimmedName, normalizedEmail, password);
  }

  if (USE_SUPABASE) {
      // Check if email already exists
      const { data: existing } = await supabase
        .from("users")
        .select("id, email_verified")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existing) {
        if (existing.email_verified) {
          const err = new Error('Email already in use.');
          err.fieldErrors = { email: 'This email is already in use.' };
          throw err;
        } else {
          try {
            await authenticatedFetch(`${API_URL}/auth/resend-verification`, {
              method: "POST",
              body: JSON.stringify({ email: normalizedEmail })
            });
          } catch (e) {
            console.error("Failed to trigger backend verification email:", e);
          }
          return {
            message: "This email is already registered but not yet verified. A new verification email has been sent.",
            requiresVerification: true,
          };
        }
      }

      // Hash password before storing (PCI/security compliance)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user directly into users table
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name: trimmedName,
        email: normalizedEmail,
        password_hash: hashedPassword,
        role: 'customer',
        is_active: true,
        email_verified: false,
        consent_given_at: consentData?.consent_given ? new Date().toISOString() : null,
        age_confirmed_at: consentData?.age_confirmed ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      const normalizedMessage = String(error.message || '').toLowerCase();
      if (String(error.code || '') === '23505' || normalizedMessage.includes('duplicate') || normalizedMessage.includes('already exists')) {
        const duplicateError = new Error('Email already in use.');
        duplicateError.fieldErrors = { email: 'This email is already in use.' };
        duplicateError.status = 409;
        throw duplicateError;
      }

      throw new Error(error.message || 'Registration failed.');
    }

    // Call the backend to generate the token and physically send the email
    try {
      await authenticatedFetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail })
      });
    } catch (emailErr) {
      console.error('Failed to trigger backend verification email:', emailErr);

      // Avoid leaving an unusable account when verification email cannot be delivered.
      if (newUser?.id) {
        const { error: cleanupError } = await supabase
          .from('users')
          .delete()
          .eq('id', newUser.id);

        if (cleanupError) {
          console.error('Failed to roll back user after verification email failure:', cleanupError);
        }
      }

      const verificationError = new Error('We could not send a verification email to that address. Please check the email and try again.');
      verificationError.fieldErrors = {
        email: 'We could not send a verification email to this address. Please check it and try again.',
      };
      verificationError.code = 'EMAIL_VERIFICATION_DELIVERY_FAILED';
      throw verificationError;
    }

    return {
      message: 'Registration successful! Please check your email to verify your account before logging in.',
      requiresVerification: true,
    };
  }

  return await authenticatedFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name: trimmedName, email: normalizedEmail, password, confirmPassword, otp, ...consentData }),
  });
};

export const sendRegistrationOtp = async (email, name) => {
  if (USE_MOCK_DATA || USE_SUPABASE) {
    // For mock, just return success
    return { message: 'OTP sent (mock)' };
  }
  return await authenticatedFetch(`${API_URL}/auth/send-registration-otp`, {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
};

export const logoutApi = async () => {
  if (USE_SUPABASE) {
    localStorage.removeItem('shopCoreToken');
    return;
  }
  await authenticatedFetch(`${API_URL}/auth/logout`, { method: 'POST' });
};

// Get authenticated user profile (used by OAuth callback to avoid PII in URL)
export const getProfile = async () => {
  if (USE_SUPABASE) {
    const tokenData = localStorage.getItem('shopCoreToken');
    if (!tokenData) throw new Error('Not authenticated');
    const payload = JSON.parse(atob(tokenData.replace('sb-token-', '')));
    const { data, error } = await supabase.from('users').select('*').eq('id', payload.id).single();
    if (error || !data) throw new Error('User not found');
    return {
      id: data.id, name: data.name, email: data.email, role: data.role,
      phone: data.phone, avatar: data.avatar, store_credit: data.store_credit,
      is_active: data.is_active, last_login: data.last_login, email_verified: data.email_verified,
    };
  }
  return await authenticatedFetch(`${API_URL}/auth/profile`);
};

// Delete account - Right to be Forgotten (RA 10173 Â§18)
export const deleteAccount = async (password) => {
  if (USE_SUPABASE) {
    const user = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');
    if (!user.id) throw new Error('Not authenticated');

    // Require password confirmation for password-based accounts.
    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .single();
    if (userErr) throw new Error(userErr.message);
    if (dbUser?.password_hash) {
      if (!password) throw new Error('Password is required to delete your account');
      const isValidPassword = await bcrypt.compare(password, dbUser.password_hash);
      if (!isValidPassword) throw new Error('Incorrect password');
    }

    const { error } = await supabase
      .from('users')
      .update({ is_active: false, name: 'Deleted User', email: `deleted_${user.id}@removed.local`, phone: null })
      .eq('id', user.id);
    if (error) throw new Error(error.message);
    return { message: 'Account deleted successfully' };
  }
  return await authenticatedFetch(`${API_URL}/auth/account`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
};

// Data export / portability - RA 10173 Â§18
export const exportMyData = async () => {
  if (USE_SUPABASE) {
    const user = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');
    if (!user.id) throw new Error('Not authenticated');
    const { data: userData } = await supabase.from('users').select('id, name, email, phone, role, created_at, last_login').eq('id', user.id).single();
    const { data: orders } = await supabase.from('orders').select('id, status, total_amount, created_at').eq('user_id', user.id);
    const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', user.id);
    return { exported_at: new Date().toISOString(), legal_basis: 'RA 10173 Â§18', personal_information: userData, orders: orders || [], addresses: addresses || [] };
  }
  return await authenticatedFetch(`${API_URL}/auth/export-data`);
};

// Resend email verification
export const resendVerification = async (email) => {
  if (USE_SUPABASE) {
    return { message: 'Verification email sent' };
  }
  return await authenticatedFetch(`${API_URL}/auth/resend-verification`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const forgotPassword = async (email) => {
  const csrfToken = await getCsrfToken({ forceRefresh: true });
  return authenticatedFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (token, newPassword) => {
  return authenticatedFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
};

// Verify reset token validity before showing the form
export const verifyResetToken = async (token) => {
  return authenticatedFetch(`${API_URL}/auth/verify-reset-token`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
};

export const changePassword = async (currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new Error('Current password and new password are required.');
  }

  if (!STRONG_PASSWORD_REGEX.test(String(newPassword))) {
    throw new Error('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    const { data: dbUser, error: fetchErr } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', currentUser.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    if (!dbUser?.password_hash) {
      throw new Error('This account does not have a password to change. Please use account recovery or set a password from your login provider settings.');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!isValidPassword) throw new Error('Current password is incorrect');

    const isSamePassword = await bcrypt.compare(newPassword, dbUser.password_hash);
    if (isSamePassword) throw new Error('New password must be different from your current password.');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const { error } = await supabase.from('users').update({ password_hash: hashedPassword }).eq('id', currentUser.id);
    if (error) throw new Error(error.message);
    return { message: 'Password changed successfully' };
  }
  return authenticatedFetch(`${API_URL}/auth/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};


// 2FA
export const setup2FA = async () => {
  return authenticatedFetch(`${API_URL}/auth/2fa/setup`);
};

export const verify2FA = async (totp_code) => {
  return authenticatedFetch(`${API_URL}/auth/2fa/verify`, {
    method: 'POST',
    body: JSON.stringify({ totp_code }),
  });
};

export const disable2FA = async (password) => {
  return authenticatedFetch(`${API_URL}/auth/2fa`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
};

export const exchangeOAuthCode = async (code) => {
  const data = await authenticatedFetch(`${API_URL}/auth/exchange-code`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (USE_SUPABASE && data && data.user) {
    const token = "sb-token-" + btoa(JSON.stringify({ id: data.user.id, email: data.user.email, role: data.user.role }));
    return { user: data.user, token };
  }
  return data;
};

// Sessions
export const getActiveSessions = async () => {
  return authenticatedFetch(`${API_URL}/auth/sessions`);
};

export const revokeSession = async (sessionId) => {
  await authenticatedFetch(`${API_URL}/auth/sessions/${sessionId}`, { method: 'DELETE' });
};

// Activity Logs (admin)
export const getActivityLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    const limit = parseInt(params.limit) || 50;
    const page = parseInt(params.page) || 1;
    let query = supabase.from('activity_logs').select('*, users:user_id(name, email)', { count: 'exact' });
    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.action) query = query.eq('action', params.action);
    query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      logs: (data || []).map(l => ({ ...l, user_name: l.users?.name, user_email: l.users?.email })),
      total: count || 0, page, totalPages: Math.ceil((count || 0) / limit),
    };
  }
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.userId) qs.set('userId', String(params.userId));
  if (params.action) qs.set('action', String(params.action));
  return authenticatedFetch(`${API_URL}/auth/activity-logs?${qs.toString()}`);
};

// ==================== STAFF MANAGEMENT ====================

export const getStaffList = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('users').select('id, name, email, role, phone, is_active, login_attempts, locked_until, last_login, created_at', { count: 'exact' }).in('role', ['store_staff', 'owner']);
    if (params.role) query = query.eq('role', params.role);
    if (params.status === 'active') query = query.eq('is_active', true);
    if (params.status === 'inactive') query = query.eq('is_active', false);
    if (params.search) query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
    const page = parseInt(params.page) || 1;
    const limit = 20;
    query = query.range((page - 1) * limit, page * limit - 1).order('created_at', { ascending: false });
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { staff: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) };
  }
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return authenticatedFetch(`${API_URL}/staff?${qs.toString()}`);
};

export const getStaffById = async (id) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/staff/${id}`);
};

export const addStaff = async (data) => {
  if (USE_SUPABASE) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const { data: existing } = await supabase.from('users').select('id').eq('email', data.email).single();
    if (existing) throw new Error('Email already exists');
    const { data: created, error } = await supabase.from('users').insert({
      name: data.name, email: data.email, password_hash: hashedPassword,
      role: data.role || 'store_staff', phone: data.phone || null, is_active: true, email_verified: true,
    }).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('staff.add', 'user', created.id, { name: data.name, email: data.email, role: data.role });
    return created;
  }
  return authenticatedFetch(`${API_URL}/staff`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const editStaff = async (id, data) => {
  if (USE_SUPABASE) {
    const updates = { name: data.name, email: data.email, role: data.role, phone: data.phone || null };
    const { data: updated, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('staff.edit', 'user', id, { updates });
    return updated;
  }
  return authenticatedFetch(`${API_URL}/staff/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const toggleStaffStatus = async (id) => {
  if (USE_SUPABASE) {
    const { data: user, error: fetchErr } = await supabase.from('users').select('is_active').eq('id', id).single();
    if (fetchErr) throw new Error(fetchErr.message);
    const { data: updated, error } = await supabase.from('users').update({ is_active: !user.is_active }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('staff.toggle_status', 'user', id, { is_active: updated.is_active });
    return updated;
  }
  return authenticatedFetch(`${API_URL}/staff/${id}/status`, { method: 'PATCH' });
};

export const deleteStaff = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('staff.delete', 'user', id);
    return;
  }
  await authenticatedFetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
};

export const getStaffActivity = async (id, page = 1) => {
  if (USE_SUPABASE) {
    const limit = 20;
    const { data, error, count } = await supabase.from('activity_logs').select('*', { count: 'exact' }).eq('user_id', id).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (error) throw new Error(error.message);
    return { logs: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) };
  }
  return authenticatedFetch(`${API_URL}/staff/${id}/activity?page=${page}`);
};

export const updateStaffPermissions = async (id, permissions) => {
  if (USE_SUPABASE) {
    // Delete existing and insert new
    await supabase.from('user_permissions').delete().eq('user_id', id);
    if (permissions && permissions.length > 0) {
      const rows = permissions.map(p => ({ user_id: id, permission_id: p.permission_id, granted: p.granted }));
      const { error } = await supabase.from('user_permissions').insert(rows);
      if (error) throw new Error(error.message);
    }
    await logSupabaseActivity('staff.update_permissions', 'user', id, { permissions });
    return;
  }
  await authenticatedFetch(`${API_URL}/staff/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
};

export const getAllPermissions = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('permissions').select('*').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/staff/permissions`);
};

export const getStaffPerformance = async (id, period = 30) => {
  if (USE_SUPABASE) {
    const since = new Date();
    since.setDate(since.getDate() - period);
    const { data: logs } = await supabase.from('activity_logs').select('action, created_at').eq('user_id', id).gte('created_at', since.toISOString());
    const actions = logs || [];
    return {
      total_actions: actions.length,
      period_days: period,
      actions_per_day: period > 0 ? parseFloat((actions.length / period).toFixed(1)) : 0,
      action_breakdown: actions.reduce((acc, l) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {}),
    };
  }
  return authenticatedFetch(`${API_URL}/staff/${id}/performance?period=${period}`);
};

// ==================== SUPABASE PRODUCT HELPERS ====================

const mapProductFromSupabase = (p) => ({
  ...p,
  partNumber: p.part_number,
  buyingPrice: p.buying_price,
  boxNumber: p.box_number,
  shipping_option: normalizeProductShippingOption(p.shipping_option),
  shipping_weight_kg: normalizeProductShippingWeight(p.shipping_weight_kg),
  shipping_dimensions: normalizeProductShippingDimensions(p.shipping_dimensions),
  bulk_pricing: normalizeBulkPricing(p.bulk_pricing),
  rating: Number(p.rating || 0),
  reviewCount: Number(p.review_count ?? p.reviewCount ?? 0),
});

const normalizeProductImageUrls = (value) => {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )).slice(0, 9);
};

const normalizeBulkPricing = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((tier) => {
      const minQty = Number(tier?.min_qty ?? tier?.minQty);
      const unitPrice = Number(tier?.unit_price ?? tier?.unitPrice);
      if (!Number.isInteger(minQty) || minQty < 2) return null;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
      return {
        min_qty: minQty,
        unit_price: unitPrice,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.min_qty - b.min_qty);
};

const normalizeProductShippingOption = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'express') return 'express';
  return 'standard';
};

const normalizeProductShippingWeight = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(3));
};

const normalizeProductShippingDimensions = (value) => {
  if (value === undefined || value === null || value === '') return null;

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const lengthCm = Number(parsed.length_cm ?? parsed.length);
  const widthCm = Number(parsed.width_cm ?? parsed.width);
  const heightCm = Number(parsed.height_cm ?? parsed.height);

  if (!Number.isFinite(lengthCm) || lengthCm <= 0) return null;
  if (!Number.isFinite(widthCm) || widthCm <= 0) return null;
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;

  return {
    length_cm: Number(lengthCm.toFixed(2)),
    width_cm: Number(widthCm.toFixed(2)),
    height_cm: Number(heightCm.toFixed(2)),
    unit: 'cm',
  };
};

const normalizeSkuToken = (value, fallback = 'SKU') => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22);

  return normalized || fallback;
};

const buildAutoSku = (product = {}) => {
  const base = normalizeSkuToken(product.partNumber, '') || normalizeSkuToken(product.name, 'SKU');
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${base}-${suffix}`;
};

const mapProductToSupabase = (product) => ({
  ...(() => {
    const manualSku = toNullableString(product.sku);
    const shouldAutoGenerateSku = product.auto_generate_sku === true;
    return {
      sku: shouldAutoGenerateSku ? buildAutoSku(product) : manualSku,
    };
  })(),
  part_number: toNullableString(product.partNumber),
  name: product.name,
  description: product.description,
  price: product.price,
  buying_price: product.buyingPrice,
  image: toNullableString(product.image),
  ...(Object.prototype.hasOwnProperty.call(product, 'video_url')
    ? { video_url: toNullableString(product.video_url) }
    : {}),
  category_id: product.category_id,
  stock_quantity: product.stock_quantity,
  ...(Object.prototype.hasOwnProperty.call(product, 'shipping_option')
    ? { shipping_option: normalizeProductShippingOption(product.shipping_option) }
    : {}),
  ...(Object.prototype.hasOwnProperty.call(product, 'shipping_weight_kg')
    ? { shipping_weight_kg: normalizeProductShippingWeight(product.shipping_weight_kg) }
    : {}),
  ...(Object.prototype.hasOwnProperty.call(product, 'shipping_dimensions')
    ? { shipping_dimensions: normalizeProductShippingDimensions(product.shipping_dimensions) }
    : {}),
  box_number: toNullableString(product.boxNumber),
  low_stock_threshold: product.low_stock_threshold,
  brand: toNullableString(product.brand),
  barcode: toNullableString(product.barcode),
  sale_price: product.sale_price,
  is_on_sale: product.is_on_sale,
  status: toNullableString(product.status) || 'available',
  image_urls: normalizeProductImageUrls(product.image_urls),
  bulk_pricing: normalizeBulkPricing(product.bulk_pricing),
});

const toApprovedReviewStatus = (review) => {
  if (!review) return 'pending';
  if (review.review_status) return review.review_status;
  return review.is_approved ? 'approved' : 'pending';
};

const mapReviewForDisplay = (review, { currentUser, currentUserId, user } = {}) => {
  const isMine = currentUserId > 0 && Number(review?.user_id) === currentUserId;
  return {
    ...review,
    rating: Number(review?.rating || 0),
    review_status: toApprovedReviewStatus(review),
    media_urls: normalizeReviewMedia(review?.media_urls),
    verified_purchase: Boolean(review?.verified_purchase),
    user_name: user?.name || review?.user_name || (isMine ? (currentUser?.name || 'You') : 'Customer'),
    user_avatar: user?.avatar || review?.user_avatar || (isMine ? (currentUser?.avatar || null) : null),
    is_mine: isMine,
  };
};

const REVIEW_MEDIA_BUCKET = 'review-media';
const REVIEW_MEDIA_MAX_FILES = 4;
const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const REVIEW_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const REVIEW_ELIGIBLE_ORDER_STATUSES = ['delivered', 'completed'];

const buildReviewEligibilityError = () => {
  const eligibilityError = new Error('Only customers with delivered orders for this product can leave a review.');
  eligibilityError.status = 403;
  eligibilityError.fieldErrors = {
    product: 'Only delivered purchases can be reviewed.',
  };
  return eligibilityError;
};

const isReviewVideo = (value = '') => /\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i.test(String(value));

const normalizeReviewMedia = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return {
          url: item.trim(),
          kind: isReviewVideo(item) ? 'video' : 'image',
        };
      }

      if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim()) {
        const kindHint = String(item.kind || item.type || item.media_type || '').toLowerCase();
        const kind = kindHint === 'video' || kindHint === 'image'
          ? kindHint
          : (isReviewVideo(item.url) ? 'video' : 'image');
        return {
          url: item.url.trim(),
          kind,
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, REVIEW_MEDIA_MAX_FILES);
};

const parseReviewMediaPayload = (review = {}) => {
  return normalizeReviewMedia(review.media_urls || review.mediaUrls || []);
};

const validateReviewMediaFiles = (files = []) => {
  if (files.length > REVIEW_MEDIA_MAX_FILES) {
    throw new Error(`You can attach up to ${REVIEW_MEDIA_MAX_FILES} files per review.`);
  }

  files.forEach((file) => {
    const mime = String(file?.type || '').toLowerCase();
    const size = Number(file?.size || 0);

    if (mime.startsWith('image/')) {
      if (size > REVIEW_IMAGE_MAX_BYTES) {
        throw new Error('Each image must be 5 MB or smaller.');
      }
      return;
    }

    if (mime.startsWith('video/')) {
      if (size > REVIEW_VIDEO_MAX_BYTES) {
        throw new Error('Each video must be 25 MB or smaller.');
      }
      return;
    }

    throw new Error('Only image and video files are allowed for review attachments.');
  });
};

const uploadReviewMediaFiles = async ({ files = [], userId, productId }) => {
  if (!Array.isArray(files) || files.length === 0) return [];

  validateReviewMediaFiles(files);

  const uploadReviewMediaViaBackend = async (file) => {
    const queryParams = new URLSearchParams();
    if (Number.isInteger(Number(productId)) && Number(productId) > 0) {
      queryParams.set('product_id', String(productId));
    }
    const querySuffix = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const result = await authenticatedFetch(`${API_URL}/reviews/upload-media${querySuffix}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    const media = result?.media || {};
    const url = typeof media.url === 'string' ? media.url.trim() : '';
    if (!url) {
      throw new Error('Review media upload failed to return a file URL.');
    }

    return {
      url,
      kind: media.kind === 'video' || media.kind === 'image'
        ? media.kind
        : (String(file?.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image'),
    };
  };

  const uploads = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const mime = String(file?.type || '').toLowerCase();
    const kind = mime.startsWith('video/') ? 'video' : 'image';
    const rawExt = String(file?.name || '').split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg');
    const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || (kind === 'video' ? 'mp4' : 'jpg');
    const objectPath = `user-${userId}/product-${productId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.${extension}`;

    let uploadedMedia = null;

    if (USE_SUPABASE && supabase) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(REVIEW_MEDIA_BUCKET)
          .upload(objectPath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicData } = supabase.storage
          .from(REVIEW_MEDIA_BUCKET)
          .getPublicUrl(objectPath);

        if (publicData?.publicUrl) {
          uploadedMedia = {
            url: publicData.publicUrl,
            kind,
          };
        }
      } catch (supabaseUploadError) {
        const fallbackMedia = await uploadReviewMediaViaBackend(file).catch((backendUploadError) => {
          const supabaseMessage = String(supabaseUploadError?.message || 'Supabase storage upload failed.');
          const backendMessage = String(backendUploadError?.message || 'Backend upload fallback failed.');

          if (backendMessage.toLowerCase().includes('failed to fetch')) {
            throw new Error('Review media upload failed. Supabase storage is unavailable and backend fallback is unreachable. Start the backend server and try again.');
          }

          throw new Error(`Failed to upload review media. ${supabaseMessage} ${backendMessage}`.trim());
        });
        uploadedMedia = fallbackMedia;
      }
    } else {
      uploadedMedia = await uploadReviewMediaViaBackend(file);
    }

    uploads.push(uploadedMedia);
  }

  return normalizeReviewMedia(uploads);
};

const assertSupabaseReviewEligibility = async ({ userId, productId }) => {
  const normalizedUserId = Number(userId);
  const normalizedProductId = Number(productId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0 || !Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    throw buildReviewEligibilityError();
  }

  const { data: deliveredOrders, error: deliveredOrdersError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', normalizedUserId)
    .in('status', REVIEW_ELIGIBLE_ORDER_STATUSES);

  if (deliveredOrdersError) {
    throw new Error(deliveredOrdersError.message);
  }

  const deliveredOrderIds = (deliveredOrders || [])
    .map((order) => Number(order.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (deliveredOrderIds.length === 0) {
    throw buildReviewEligibilityError();
  }

  const { data: purchasedItem, error: purchasedItemError } = await supabase
    .from('order_items')
    .select('id')
    .eq('product_id', normalizedProductId)
    .in('order_id', deliveredOrderIds)
    .limit(1)
    .maybeSingle();

  if (purchasedItemError) {
    throw new Error(purchasedItemError.message);
  }

  if (!purchasedItem) {
    throw buildReviewEligibilityError();
  }
};

const applyReviewStatsToProducts = async (products) => {
  const items = Array.isArray(products) ? products : [];
  if (!USE_SUPABASE || items.length === 0) {
    return items;
  }

  const productIds = [...new Set(items.map((product) => Number(product.id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (productIds.length === 0) {
    return items.map((product) => ({
      ...product,
      rating: Number(product.rating || 0),
      reviewCount: Number(product.reviewCount ?? product.review_count ?? 0),
    }));
  }

  const { data, error } = await supabase
    .from('reviews')
    .select('product_id, rating, review_status, is_approved')
    .in('product_id', productIds);

  if (error) {
    throw new Error(error.message);
  }

  const statsMap = new Map();
  (data || []).forEach((review) => {
    if (toApprovedReviewStatus(review) !== 'approved') return;
    const productId = Number(review.product_id);
    const existing = statsMap.get(productId) || { total: 0, count: 0 };
    existing.total += Number(review.rating || 0);
    existing.count += 1;
    statsMap.set(productId, existing);
  });

  return items.map((product) => {
    const stats = statsMap.get(Number(product.id));
    const fallbackRating = Number(product.rating || 0);
    const fallbackCount = Number(product.reviewCount ?? product.review_count ?? 0);

    return {
      ...product,
      rating: stats?.count ? Number((stats.total / stats.count).toFixed(1)) : fallbackRating,
      reviewCount: stats?.count ?? fallbackCount,
    };
  });
};

const tokenizeProductSearchTerms = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim();

  if (!normalized) return [];

  const seen = new Set();
  const terms = [];
  normalized.split(/\s+/).forEach((term) => {
    if (!term || term.length < 2 || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms.slice(0, 8);
};

const buildProductSearchableText = (product) => {
  const tagText = Array.isArray(product?.tags)
    ? product.tags.join(' ')
    : String(product?.tags || '');
  const keywordText = Array.isArray(product?.keywords)
    ? product.keywords.join(' ')
    : String(product?.keywords || '');

  return [
    product?.name,
    product?.description,
    product?.brand,
    product?.sku,
    product?.part_number,
    product?.partNumber,
    product?.category_name,
    product?.categoryName,
    tagText,
    keywordText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const normalizeSearchPhrase = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getProductSearchScore = (product, searchTerms, searchPhrase) => {
  const name = String(product?.name || '').toLowerCase();
  const partNumber = String(product?.part_number || product?.partNumber || '').toLowerCase();
  const brand = String(product?.brand || '').toLowerCase();
  const sku = String(product?.sku || '').toLowerCase();
  const category = String(product?.category_name || product?.categoryName || '').toLowerCase();
  const description = String(product?.description || '').toLowerCase();
  const tags = Array.isArray(product?.tags)
    ? product.tags.join(' ').toLowerCase()
    : String(product?.tags || '').toLowerCase();
  const keywords = Array.isArray(product?.keywords)
    ? product.keywords.join(' ').toLowerCase()
    : String(product?.keywords || '').toLowerCase();

  let score = 0;

  if (searchPhrase) {
    if (name === searchPhrase) score += 250;
    if (name.startsWith(searchPhrase)) score += 170;
    if (name.includes(searchPhrase)) score += 120;
    if (partNumber === searchPhrase) score += 180;
    if (partNumber.includes(searchPhrase)) score += 110;
    if (tags.includes(searchPhrase) || keywords.includes(searchPhrase)) score += 120;
  }

  searchTerms.forEach((term) => {
    if (name === term) score += 120;
    if (name.startsWith(term)) score += 60;
    if (name.includes(term)) score += 36;
    if (partNumber.startsWith(term)) score += 32;
    if (partNumber.includes(term)) score += 24;
    if (sku.includes(term)) score += 20;
    if (brand.includes(term)) score += 16;
    if (category.includes(term)) score += 14;
    if (tags.includes(term) || keywords.includes(term)) score += 40;
    if (description.includes(term)) score += 8;
  });

  return score;
};

const parseProductSearchLimit = (value, fallback = null, max = 80) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  return Math.min(parsed, max);
};

// ==================== PRODUCTS ====================

export const getTopSellers = async (days = null) => {
  if (USE_MOCK_DATA) {
    const products = await getProductsMock();
    return products.sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0)).slice(0, 8);
  }

  if (USE_SUPABASE) {
    let query = supabase
      .from('orders')
      .select('id, created_at, order_items(quantity, product_id, products(id, name, part_number, image, description, price, sale_price, is_on_sale, stock_quantity, rating, brand, created_at, categories(name)))')
      .eq('status', 'completed');

    if (days && days !== 'all') {
      const parsedDays = Number.parseInt(String(days), 10);
      if (Number.isFinite(parsedDays) && parsedDays > 0) {
        const since = new Date();
        since.setDate(since.getDate() - parsedDays);
        query = query.gte('created_at', since.toISOString());
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const topSellerMap = new Map();
    (data || []).forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const product = item.products;
        const productId = Number(item.product_id || product?.id);
        if (!product || !productId) return;

        const existing = topSellerMap.get(productId) || {
          ...product,
          category_name: product.categories?.name || null,
          total_sold: 0,
        };

        existing.total_sold += Number(item.quantity || 0);
        topSellerMap.set(productId, existing);
      });
    });

    const topProducts = Array.from(topSellerMap.values())
      .sort((a, b) => {
        const soldDiff = Number(b.total_sold || 0) - Number(a.total_sold || 0);
        if (soldDiff !== 0) return soldDiff;
        return Number(b.id || 0) - Number(a.id || 0);
      })
      .slice(0, 8);

    return applyReviewStatsToProducts(topProducts.map((p) => ({
      ...mapProductFromSupabase(p),
      category_name: p.category_name,
      total_sold: Number(p.total_sold || 0),
    })));
  }

  const queryParams = new URLSearchParams();
  if (days && days !== 'all') queryParams.append('days', days);
  const qString = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const products = await authenticatedFetch(`${API_URL}/products/top-sellers${qString}`);
  return products.map((p) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
    reviewCount: Number(p.review_count ?? p.reviewCount ?? 0),
  }));
};

export const getProducts = async (params = {}) => {
  if (USE_MOCK_DATA) {
    return getProductsMock(params);
  }

  const searchTerms = tokenizeProductSearchTerms(params.search);
  const searchPhrase = normalizeSearchPhrase(params.search);
  const resultLimit = parseProductSearchLimit(params.limit, null, 80);

  if (USE_SUPABASE) {
    let query = supabase
      .from('products')
      .select('*, categories(name)')
      .order('id', { ascending: false });
      
    if (searchTerms.length > 0) {
      searchTerms.forEach((term) => {
        // We use inner quotes to prevent any issues with comma, but simple ilike allows commas
        // .or() concatenates multiple conditions with OR. 
        // Multiple .or() chains essentially operate as ANDs between the groups.
        query = query.or(`name.ilike.%${term}%,part_number.ilike.%${term}%,description.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`);
      });
    }

    if (resultLimit) {
      query = query.limit(resultLimit);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    let products = await applyReviewStatsToProducts((data || []).map((p) => ({
      ...mapProductFromSupabase(p),
      category_name: p.categories?.name,
    })));

    // Client-side relevance filtering/sorting for Supabase mode to match backend behavior.
    if (searchTerms.length > 0 && products.length > 0) {
      products = products.filter((product) => {
        const searchable = buildProductSearchableText(product);
        return searchTerms.every((term) => searchable.includes(term));
      });

      products.sort((a, b) => {
        const scoreA = getProductSearchScore(a, searchTerms, searchPhrase);
        const scoreB = getProductSearchScore(b, searchTerms, searchPhrase);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }

    if (resultLimit) {
      products = products.slice(0, resultLimit);
    }

    return products;
  }

  const queryParams = new URLSearchParams();
  if (params.search) queryParams.append('search', params.search);
  if (params.category) queryParams.append('category', params.category);
  if (resultLimit) queryParams.append('limit', String(resultLimit));
  const qString = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const products = await authenticatedFetch(`${API_URL}/products${qString}`);
  return products.map((p) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
    reviewCount: Number(p.review_count ?? p.reviewCount ?? 0),
  }));
};

export const getProductById = async (id) => {
  if (USE_MOCK_DATA) {
    return getProductByIdMock(id);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    const [product] = await applyReviewStatsToProducts([{
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    }]);

    const variantData = await getProductVariants(id).catch(() => ({ options: [], variants: [] }));

    return {
      ...product,
      variant_options: variantData.options || [],
      variants: variantData.variants || [],
    };
  }

  const product = await authenticatedFetch(`${API_URL}/products/${id}`);
  const variantData = await getProductVariants(id).catch(() => ({ options: [], variants: [] }));

  return {
    ...product,
    partNumber: product.part_number,
    buyingPrice: product.buying_price,
    boxNumber: product.box_number,
    reviewCount: Number(product.review_count ?? product.reviewCount ?? 0),
    variant_options: variantData.options || [],
    variants: variantData.variants || [],
  };
};

export const addProduct = async (product) => {
  if (USE_MOCK_DATA) {
    return addProductMock(product);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .insert(mapProductToSupabase(product))
      .select('*, categories(name)')
      .single();

    if (error) throw new Error(error.message);

    await logSupabaseActivity('product.create', 'product', data.id, { name: product.name });
    return {
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    };
  }

  // Map frontend fields to backend fields
  const backendProduct = {
    part_number: toNullableString(product.partNumber),
    name: product.name,
    description: product.description,
    price: product.price,
    buying_price: product.buyingPrice,
    image: toNullableString(product.image),
    video_url: product.video_url === undefined ? undefined : toNullableString(product.video_url),
    category_id: product.category_id,
    stock_quantity: product.stock_quantity,
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_option')
      ? { shipping_option: normalizeProductShippingOption(product.shipping_option) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_weight_kg')
      ? { shipping_weight_kg: normalizeProductShippingWeight(product.shipping_weight_kg) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_dimensions')
      ? { shipping_dimensions: normalizeProductShippingDimensions(product.shipping_dimensions) }
      : {}),
    box_number: toNullableString(product.boxNumber),
    low_stock_threshold: product.low_stock_threshold,
    brand: toNullableString(product.brand),
    sku: toNullableString(product.sku),
    barcode: toNullableString(product.barcode),
    sale_price: product.sale_price,
    is_on_sale: product.is_on_sale,
    status: toNullableString(product.status) || 'available',
    image_urls: normalizeProductImageUrls(product.image_urls),
    bulk_pricing: normalizeBulkPricing(product.bulk_pricing),
    ...(Object.prototype.hasOwnProperty.call(product, 'auto_generate_sku')
      ? { auto_generate_sku: product.auto_generate_sku === true }
      : {}),
  };

  const data = await authenticatedFetch(`${API_URL}/products`, {
    method: 'POST',
    body: JSON.stringify(backendProduct),
  });

  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const updateProduct = async (id, product) => {
  if (USE_MOCK_DATA) {
    return updateProductMock(id, product);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .update(mapProductToSupabase(product))
      .eq('id', id)
      .select('*, categories(name)')
      .single();

    if (error) throw new Error(error.message);

    await logSupabaseActivity('product.update', 'product', id, { name: product.name });
    return {
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    };
  }

  const backendProduct = {
    part_number: toNullableString(product.partNumber),
    name: product.name,
    description: product.description,
    price: product.price,
    buying_price: product.buyingPrice,
    image: toNullableString(product.image),
    video_url: product.video_url === undefined ? undefined : toNullableString(product.video_url),
    category_id: product.category_id,
    stock_quantity: product.stock_quantity,
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_option')
      ? { shipping_option: normalizeProductShippingOption(product.shipping_option) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_weight_kg')
      ? { shipping_weight_kg: normalizeProductShippingWeight(product.shipping_weight_kg) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(product, 'shipping_dimensions')
      ? { shipping_dimensions: normalizeProductShippingDimensions(product.shipping_dimensions) }
      : {}),
    box_number: toNullableString(product.boxNumber),
    low_stock_threshold: product.low_stock_threshold,
    brand: toNullableString(product.brand),
    sku: toNullableString(product.sku),
    barcode: toNullableString(product.barcode),
    sale_price: product.sale_price,
    is_on_sale: product.is_on_sale,
    status: toNullableString(product.status) || 'available',
    image_urls: normalizeProductImageUrls(product.image_urls),
    bulk_pricing: normalizeBulkPricing(product.bulk_pricing),
    ...(Object.prototype.hasOwnProperty.call(product, 'auto_generate_sku')
      ? { auto_generate_sku: product.auto_generate_sku === true }
      : {}),
  };

  const data = await authenticatedFetch(`${API_URL}/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(backendProduct),
  });

  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const deleteProduct = async (id) => {
  if (USE_MOCK_DATA) {
    return deleteProductMock(id);
  }

  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    await logSupabaseActivity('product.delete', 'product', id);
    return;
  }

  await authenticatedFetch(`${API_URL}/products/${id}`, {
    method: 'DELETE',
  });
};

export const uploadProductImage = async (file) => {
  if (!file) throw new Error('Image file is required');

  const token = getAuthToken();
  if (!token) throw new Error('You must be logged in to upload images');

  const data = await authenticatedFetch(`${API_URL}/products/upload-image`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  const imageUrl = data.imageUrl || '';
  if (!imageUrl) throw new Error('Image upload failed');

  if (imageUrl.startsWith('/')) {
    return `${API_ORIGIN}${imageUrl}`;
  }

  return imageUrl;
};

export const uploadProductVideo = async (file) => {
  if (!file) throw new Error('Video file is required');

  const token = getAuthToken();
  if (!token) throw new Error('You must be logged in to upload videos');

  const data = await authenticatedFetch(`${API_URL}/products/upload-video`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  const videoUrl = data.videoUrl || '';
  if (!videoUrl) throw new Error('Video upload failed');

  if (videoUrl.startsWith('/')) {
    return `${API_ORIGIN}${videoUrl}`;
  }

  return videoUrl;
};

// ==================== CATEGORIES ====================

export const getCategories = async () => {
  if (USE_MOCK_DATA) {
    return getCategoriesMock();
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('id');

    if (error) throw new Error(error.message);
    return data || [];
  }

  return await authenticatedFetch(`${API_URL}/categories`);
};

export const addCategory = async (name) => {
  if (USE_MOCK_DATA) {
    return addCategoryMock(name);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single();

    if (error) throw new Error(error.message);
    await logSupabaseActivity('category.create', 'category', data.id, { name });
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const updateCategory = async (id, name) => {
  if (USE_MOCK_DATA) {
    return updateCategoryMock(id, name);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    await logSupabaseActivity('category.update', 'category', id, { name });
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const deleteCategory = async (id) => {
  if (USE_MOCK_DATA) {
    return deleteCategoryMock(id);
  }

  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    await logSupabaseActivity('category.delete', 'category', id);
    return;
  }

  await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'DELETE',
  });
};

// ==================== MOCK DATA (Fallback) ====================
// Keep existing mock data and functions for development/testing

const MOCK_CATEGORIES = [
  { id: 1, name: 'NMAX V1' },
  { id: 2, name: 'NMAX V2' },
  { id: 3, name: 'AEROX V1' },
  { id: 4, name: 'AEROX V2' },
  { id: 5, name: 'M3 MIO' },
  { id: 6, name: 'CLICK 150' },
  { id: 7, name: 'CLICK 125' },
  { id: 8, name: 'BEAT V2' },
  { id: 9, name: 'Universal Parts' },
];

let MOCK_PRODUCTS = [
  {
    id: 1,
    partNumber: '2DP-H2129-00',
    name: 'Battery Cover',
    description: 'Original Yamaha Battery Cover for NMAX V1.',
    price: 150.00,
    buyingPrice: 104.00,
    image: 'https://images.unsplash.com/photo-1558564175-99645903c7bb?auto=format&fit=crop&q=80&w=400',
    category_id: 1,
    category_name: 'NMAX V1',
    stock_quantity: 2,
    boxNumber: '2F STAIRS',
    low_stock_threshold: 2,
    brand: 'Yamaha',
    rating: 4.5,
    reviewCount: 12,
    sku: 'SKU-001',
    barcode: '123456789012'
  },
];

const MOCK_USERS = [
  { id: 1, name: 'Admin User', email: 'admin@10thwest.com', role: Role.ADMIN },
  { id: 2, name: 'Moto Rider', email: 'customer@10thwest.com', role: Role.CUSTOMER },
  { id: 3, name: 'Cashier Staff', email: 'cashier@10thwest.com', role: Role.CASHIER }
];

// Mock authentication functions
const loginMock = async (email, password) => {
  await new Promise(resolve => setTimeout(resolve, 500));

  const user = MOCK_USERS.find(u => u.email === email);
  if (!user) throw new Error('Invalid credentials');

  if (
    (email === 'admin@10thwest.com' && password === 'admin123') ||
    (email === 'cashier@10thwest.com' && password === 'cashier123') ||
    (email === 'customer@10thwest.com' && password === 'customer123')
  ) {
    const token = 'mock-jwt-token-' + Math.random();
    return { user, token };
  }

  throw new Error('Invalid credentials');
};

const registerMock = async (name, email, password) => {
  await new Promise(resolve => setTimeout(resolve, 500));

  const newUser = {
    id: MOCK_USERS.length + 1,
    name,
    email,
    role: Role.CUSTOMER
  };

  MOCK_USERS.push(newUser);
  const token = 'mock-jwt-token-' + Math.random();

  return { user: newUser, token };
};

// Mock product functions
const getProductsMock = async (params = {}) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  let result = [...MOCK_PRODUCTS];
  const searchTerms = tokenizeProductSearchTerms(params.search);
  const searchPhrase = normalizeSearchPhrase(params.search);
  const resultLimit = parseProductSearchLimit(params.limit, null, 80);

  if (searchTerms.length > 0) {
    result = result.filter(p => {
      const searchable = buildProductSearchableText(p);
      return searchTerms.every((term) => searchable.includes(term));
    });

    result.sort((a, b) => {
      const scoreA = getProductSearchScore(a, searchTerms, searchPhrase);
      const scoreB = getProductSearchScore(b, searchTerms, searchPhrase);
      return scoreB - scoreA;
    });
  }

  if (params.category) {
    result = result.filter((p) => String(p.category_id) === String(params.category));
  }

  if (resultLimit) {
    result = result.slice(0, resultLimit);
  }

  return result;
};

const getProductByIdMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 200));
  const product = MOCK_PRODUCTS.find(p => p.id === id);
  if (!product) throw new Error('Product not found');
  return product;
};

const addProductMock = async (product) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newProduct = {
    id: MOCK_PRODUCTS.length + 1,
    ...product,
  };
  MOCK_PRODUCTS.push(newProduct);
  return newProduct;
};

const updateProductMock = async (id, updates) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_PRODUCTS.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Product not found');
  MOCK_PRODUCTS[index] = { ...MOCK_PRODUCTS[index], ...updates };
  return MOCK_PRODUCTS[index];
};

const deleteProductMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  MOCK_PRODUCTS = MOCK_PRODUCTS.filter(p => p.id !== id);
};

// Mock category functions
const getCategoriesMock = async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return [...MOCK_CATEGORIES];
};

const addCategoryMock = async (name) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newCategory = {
    id: MOCK_CATEGORIES.length + 1,
    name,
  };
  MOCK_CATEGORIES.push(newCategory);
  return newCategory;
};

const updateCategoryMock = async (id, name) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index === -1) throw new Error('Category not found');
  MOCK_CATEGORIES[index].name = name;
  return MOCK_CATEGORIES[index];
};

const deleteCategoryMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index > -1) {
    MOCK_CATEGORIES.splice(index, 1);
  }
};

// ==================== ORDERS ====================

const ORDER_VAT_RATE = 0.12;
const ORDER_FREE_STANDARD_SHIPPING_THRESHOLD = 2500;
const ORDER_STANDARD_SHIPPING_FEE = 150;
const ORDER_EXPRESS_SHIPPING_FEE = 300;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => {
  const parsed = toFiniteNumber(value, 0);
  return Math.round(parsed * 100) / 100;
};

const normalizeShippingMethod = (value) => {
  const normalized = String(value || 'standard').trim().toLowerCase();
  if (normalized === 'express' || normalized === 'pickup' || normalized === 'standard') {
    return normalized;
  }
  return 'standard';
};

const deriveShippingFromMethod = (shippingMethod, subtotalAmount) => {
  if (shippingMethod === 'pickup') return 0;
  if (shippingMethod === 'express') return ORDER_EXPRESS_SHIPPING_FEE;
  return subtotalAmount >= ORDER_FREE_STANDARD_SHIPPING_THRESHOLD ? 0 : ORDER_STANDARD_SHIPPING_FEE;
};

const mapOrderItemToCartItem = (item) => {
  const rawProductReference = item.product_id ?? item.productId ?? item.product?.id ?? null;
  const parsedProductId = Number(rawProductReference);
  const hasProductReference = Number.isInteger(parsedProductId) && parsedProductId > 0;
  const resolvedQuantity = Math.max(1, Math.trunc(toFiniteNumber(item.quantity ?? item.qty, 1)));
  const productId = hasProductReference ? parsedProductId : 0;
  const product = {
    id: productId,
    partNumber: item.product_part_number ?? item.product?.partNumber ?? item.product?.part_number ?? '',
    name: item.product_name ?? item.product?.name ?? 'Unknown Item',
    description: item.product?.description ?? '',
    price: roundCurrency(item.product_price ?? item.price ?? item.product_price_current ?? item.product?.price ?? 0),
    buyingPrice: roundCurrency(item.product_buying_price ?? item.product?.buyingPrice ?? item.product?.buying_price ?? 0),
    image: item.product_image ?? item.product?.image ?? '',
    category_id: item.product_category_id ?? item.product?.category_id ?? 0,
    stock_quantity: item.product_stock_quantity ?? item.product?.stock_quantity ?? 0,
    boxNumber: item.product_box_number ?? item.product?.boxNumber ?? item.product?.box_number ?? '',
    low_stock_threshold: item.product_low_stock_threshold ?? item.product?.low_stock_threshold ?? 0,
    sale_price: (() => {
      const salePrice = toFiniteNumber(item.product_sale_price ?? item.product?.sale_price, NaN);
      return Number.isFinite(salePrice) ? roundCurrency(salePrice) : null;
    })(),
    is_on_sale: item.product_is_on_sale ?? item.product?.is_on_sale,
    sku: item.product_sku ?? item.product?.sku,
    barcode: item.product_barcode ?? item.product?.barcode,
  };

  return {
    productId,
    productReferenceId: hasProductReference ? productId : null,
    product,
    quantity: resolvedQuantity,
  };
};

const mapOrderFromApi = (order) => {
  const mappedItems = Array.isArray(order.items) ? order.items.map(mapOrderItemToCartItem) : [];
  const derivedSubtotal = roundCurrency(mappedItems.reduce((sum, item) => {
    const quantity = toFiniteNumber(item.quantity, 0);
    const price = roundCurrency(item.product?.price ?? 0);
    return sum + (price * quantity);
  }, 0));
  const discountAmount = roundCurrency(order.discount_amount ?? order.discount ?? 0);
  const shippingMethod = normalizeShippingMethod(order.shipping_method);
  const shippingAmount = roundCurrency(
    order.shipping ?? order.shipping_fee ?? deriveShippingFromMethod(shippingMethod, derivedSubtotal)
  );
  const fallbackTaxAmount = roundCurrency(Math.max(0, derivedSubtotal - discountAmount + shippingAmount) * ORDER_VAT_RATE);
  const taxAmount = roundCurrency(order.tax_amount ?? order.vat_amount ?? fallbackTaxAmount);
  const fallbackTotal = roundCurrency(Math.max(0, derivedSubtotal - discountAmount + shippingAmount + taxAmount));
  const totalAmount = roundCurrency(order.total_amount ?? order.total ?? fallbackTotal);
  const subtotalAmount = roundCurrency(order.subtotal ?? derivedSubtotal);

  return {
    id: order.id,
    user_id: order.user_id ?? undefined,
    guest_info: order.guest_name
      ? { name: order.guest_name, email: order.guest_email }
      : order.guest_info,
    items: mappedItems,
    subtotal: subtotalAmount,
    total: totalAmount,
    total_amount: totalAmount,
    discount: discountAmount,
    discount_amount: discountAmount,
    shipping: shippingAmount,
    tax_amount: taxAmount,
    shipping_method: shippingMethod,
    status: order.status,
    shipping_address: order.shipping_address ?? '',
    shipping_address_snapshot: order.shipping_address_snapshot ?? null,
    created_at: order.created_at ?? new Date().toISOString(),
    source: order.source ?? 'online',
    payment_method: order.payment_method,
    tracking_number: order.tracking_number ?? undefined,
    delivered_at: order.delivered_at ?? undefined,
    rider_confirmed_delivery_at: order.rider_confirmed_delivery_at ?? undefined,
    rider_confirmed_by: order.rider_confirmed_by ?? undefined,
    customer_confirmed_receipt_at: order.customer_confirmed_receipt_at ?? undefined,
    amount_tendered: order.amount_tendered != null ? roundCurrency(order.amount_tendered) : undefined,
    change_due: order.change_due != null ? roundCurrency(order.change_due) : undefined,
    cashier_id: order.cashier_id ?? undefined,
    promo_code_used: order.promo_code_used ?? undefined,
    shipping_lat: order.shipping_lat ?? undefined,
    shipping_lng: order.shipping_lng ?? undefined,
    return_eligible: Boolean(order.return_eligible),
    return_eligibility_message: order.return_eligibility_message ?? '',
    return_window_days: order.return_window_days != null ? toFiniteNumber(order.return_window_days) : undefined,
    return_deadline_at: order.return_deadline_at ?? null,
    return_request: order.return_request ?? null,
  };
};

const STAFF_ORDER_STATUS_TRANSITIONS = {
  pending: new Set(['paid', 'preparing', 'cancelled']),
  paid: new Set(['preparing', 'cancelled']),
  preparing: new Set(['shipped', 'cancelled']),
  shipped: new Set([]),
  delivered: new Set([]),
  completed: new Set([]),
  cancelled: new Set([]),
};

const canTransitionStaffOrderStatus = (currentStatus, nextStatus) => {
  const allowed = STAFF_ORDER_STATUS_TRANSITIONS[String(currentStatus || '').toLowerCase()] || new Set();
  return allowed.has(String(nextStatus || '').toLowerCase());
};

let MOCK_ORDERS = [];

export const getOrders = async () => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...MOCK_ORDERS];
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((order) => ({
      ...mapOrderFromApi(order),
      items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    }));
  }

  const data = await authenticatedFetch(`${API_URL}/orders`);
  return data.map(mapOrderFromApi);
};

export const getUserOrders = async (userId) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_ORDERS.filter(order => order.user_id === userId);
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    const { data: ordersData, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (ordersData || []).map((order) => ({
      ...mapOrderFromApi(order),
      items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    }));
  }

  const data = await authenticatedFetch(`${API_URL}/orders/my-orders`);
  return data.map(mapOrderFromApi);
};

export const getOrderById = async (id) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    return order;
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    return {
      ...mapOrderFromApi(data),
      items: (data.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    };
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}`);
  return mapOrderFromApi(data);
};

export const createOrder = async (order) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newOrder = {
      id: MOCK_ORDERS.length + 1001,
      user_id: order.user_id,
      items: order.items || [],
      total_amount: roundCurrency(order.total_amount || 0),
      status: OrderStatus.PENDING,
      shipping_address: order.shipping_address || '',
      shipping_address_snapshot: order.shipping_address_snapshot || null,
      shipping_lat: order.shipping_lat ?? null,
      shipping_lng: order.shipping_lng ?? null,
      created_at: new Date().toISOString(),
      source: order.source || 'online',
      payment_method: order.payment_method,
      discount_amount: roundCurrency(order.discount_amount || 0),
      tax_amount: roundCurrency(order.tax_amount || 0),
      shipping_method: normalizeShippingMethod(order.shipping_method),
      guest_info: order.guest_info,
    };
    MOCK_ORDERS.push(newOrder);
    return newOrder;
  }

  if (USE_SUPABASE) {
    // Create order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: order.user_id,
        total_amount: roundCurrency(order.total_amount),
        status: OrderStatus.PENDING,
        shipping_address: order.shipping_address,
        shipping_address_snapshot: order.shipping_address_snapshot ?? null,
        shipping_lat: order.shipping_lat ?? null,
        shipping_lng: order.shipping_lng ?? null,
        discount_amount: roundCurrency(order.discount_amount || 0),
        tax_amount: roundCurrency(order.tax_amount || 0),
        shipping_method: normalizeShippingMethod(order.shipping_method),
        source: order.source || 'online',
        payment_method: order.payment_method,
        guest_name: order.guest_info?.name,
        guest_email: order.guest_info?.email,
      })
      .select()
      .single();

    if (orderError) throw new Error(orderError.message);

    const rawItems = Array.isArray(order.items) ? order.items : [];
    const productIds = rawItems
      .map((item) => item.productId ?? item.product_id ?? item.product?.id ?? null)
      .filter((id) => id != null);

    let productLookup = new Map();
    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('id, name, price, stock_quantity')
        .in('id', [...new Set(productIds)]);

      if (productError) throw new Error(productError.message);
      productLookup = new Map((productRows || []).map((row) => [row.id, row]));
    }

    const orderItems = rawItems.map((item) => {
      const productId = item.productId ?? item.product_id ?? item.product?.id ?? null;
      const product = productId != null ? productLookup.get(productId) : null;
      const resolvedPrice = roundCurrency(
        item.product_price ?? item.price ?? item.product?.price ?? product?.price ?? 0
      );
      const resolvedQuantity = Math.max(1, Math.trunc(toFiniteNumber(item.quantity ?? 1, 1)));

      return {
        order_id: orderData.id,
        product_id: productId,
        quantity: resolvedQuantity,
        product_name: item.product_name ?? item.name ?? item.product?.name ?? product?.name ?? 'Unknown Product',
        product_price: resolvedPrice,
        price: resolvedPrice,
      };
    });

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(itemsError.message);
      }
    }

    // Decrement stock after order items insert
    for (const item of orderItems) {
      if (!item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        continue;
      }

      const product = productLookup.get(item.product_id);
      if (!product) {
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(`Product #${item.product_id} not found for stock update.`);
      }

      const { data: updatedProduct, error: stockError } = await supabase
        .from('products')
        .update({ stock_quantity: product.stock_quantity - item.quantity })
        .eq('id', item.product_id)
        .gte('stock_quantity', item.quantity)
        .select('id')
        .single();

      if (stockError || !updatedProduct) {
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(`Insufficient stock for product #${item.product_id}.`);
      }
    }

    const mapped = mapOrderFromApi(orderData);
    if (order.items && order.items.length > 0) {
      mapped.items = order.items;
    }
    await logSupabaseActivity('order.create', 'order', orderData.id, { source: order.source || 'online', total: order.total_amount, items: orderItems.length });

    // Notify admin/staff about new order
    notifyAdminStaff(
      'order.new',
      'New Order Received',
      `Order #${String(orderData.id).padStart(4, '0')} â€” â‚±${roundCurrency(order.total_amount).toLocaleString()} (${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})`,
      orderData.id,
      'order'
    );

    return mapped;
  }

  const items = (order.items || []).map(item => ({
    product_id: (item).productId ?? (item).product_id,
    quantity: (item).quantity ?? (item).quantity,
  }));

  const payload = {
    ...order,
    items,
  };

  const data = await authenticatedFetch(`${API_URL}/orders`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const mapped = mapOrderFromApi(data.order ?? data);
  if (order.items && order.items.length > 0) {
    mapped.items = order.items;
  }
  return mapped;
};

export const updateOrderStatus = async (id, status, trackingNumber = '') => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedTrackingNumber = String(trackingNumber || '').trim();

  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
      throw new Error('Use delivery and receipt confirmations for delivered/completed statuses.');
    }
    if (!canTransitionStaffOrderStatus(order.status, normalizedStatus)) {
      throw new Error(`Invalid status transition from ${order.status} to ${normalizedStatus}`);
    }
    order.status = normalizedStatus;
    if (normalizedStatus === 'shipped' && normalizedTrackingNumber) {
      order.tracking_number = normalizedTrackingNumber;
    }
    return order;
  }

  if (USE_SUPABASE) {
    if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
      throw new Error('Use delivery and receipt confirmations for delivered/completed statuses.');
    }

    const { data: currentOrder, error: currentOrderError } = await supabase
      .from('orders')
      .select('id, status, user_id, tracking_number')
      .eq('id', id)
      .single();

    if (currentOrderError || !currentOrder) {
      throw new Error(currentOrderError?.message || 'Order not found');
    }

    if (!canTransitionStaffOrderStatus(currentOrder.status, normalizedStatus)) {
      throw new Error(`Invalid status transition from ${currentOrder.status} to ${normalizedStatus}`);
    }

    const updatePayload = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    };
    if (normalizedStatus === 'shipped' && normalizedTrackingNumber) {
      updatePayload.tracking_number = normalizedTrackingNumber;
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    await logSupabaseActivity('order.update_status', 'order', id, { status: normalizedStatus });

    // Notify customer about their order status update
    if (data.user_id) {
      let firstOrderItem = null;
      try {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, product_name, products(image)')
          .eq('order_id', id)
          .limit(1);
        firstOrderItem = orderItems?.[0] || null;
      } catch {}

      createNotification({
        user_id: data.user_id,
        type: 'order.status',
        title: `Order #${String(id).padStart(4, '0')} ${normalizedStatus}`,
        message: `Your order status is now ${normalizedStatus}${firstOrderItem?.product_name ? `. Item: ${firstOrderItem.product_name}.` : '.'}`,
        reference_id: id,
        reference_type: 'order',
        thumbnail_url: firstOrderItem?.products?.image || null,
        metadata: {
          status: normalizedStatus,
          order_id: id,
          product_id: firstOrderItem?.product_id || null,
          product_name: firstOrderItem?.product_name || null,
        },
      });
    }

    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({
      status: normalizedStatus,
      tracking_number: normalizedStatus === 'shipped' && normalizedTrackingNumber
        ? normalizedTrackingNumber
        : undefined,
    }),
  });

  return mapOrderFromApi(data.order ?? data);
};

export const confirmOrderDelivery = async (id) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'shipped') throw new Error('Only shipped orders can be confirmed as delivered.');
    order.status = 'delivered';
    order.delivered_at = order.delivered_at || new Date().toISOString();
    order.rider_confirmed_delivery_at = new Date().toISOString();
    return order;
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    const { data: currentOrder, error: currentOrderError } = await supabase
      .from('orders')
      .select('id, status, user_id')
      .eq('id', id)
      .single();

    if (currentOrderError || !currentOrder) {
      throw new Error(currentOrderError?.message || 'Order not found');
    }

    if (currentOrder.status !== 'shipped') {
      throw new Error('Only shipped orders can be confirmed as delivered.');
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: nowIso,
        rider_confirmed_delivery_at: nowIso,
        rider_confirmed_by: currentUser?.id || null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    await logSupabaseActivity('order.confirm_delivery', 'order', id, {
      rider_confirmed_by: currentUser?.id || null,
    });

    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/confirm-delivery`, {
    method: 'PUT',
  });

  return mapOrderFromApi(data.order ?? data);
};

export const confirmOrderReceipt = async (id) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'delivered') {
      throw new Error('Order can be completed only after rider delivery confirmation.');
    }
    order.status = 'completed';
    order.customer_confirmed_receipt_at = new Date().toISOString();
    order.delivered_at = order.delivered_at || new Date().toISOString();
    return order;
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser?.id) throw new Error('Not authenticated');

    const { data: currentOrder, error: currentOrderError } = await supabase
      .from('orders')
      .select('id, status, user_id, delivered_at')
      .eq('id', id)
      .single();

    if (currentOrderError || !currentOrder) {
      throw new Error(currentOrderError?.message || 'Order not found');
    }

    if (currentOrder.user_id !== currentUser.id) {
      throw new Error('Access denied');
    }

    if (currentOrder.status !== 'delivered') {
      throw new Error('Order can be completed only after rider delivery confirmation.');
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        customer_confirmed_receipt_at: nowIso,
        delivered_at: currentOrder.delivered_at || nowIso,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    await logSupabaseActivity('order.confirm_receipt', 'order', id, {
      customer_id: currentUser.id,
    });

    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/confirm-receipt`, {
    method: 'PUT',
  });

  return mapOrderFromApi(data.order ?? data);
};

// Cancel order (customer - only if not yet shipped)
export const cancelOrder = async (id, reason = '') => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending' && order.status !== 'paid') throw new Error('Cannot cancel this order');
    order.status = 'cancelled';
    order.cancellation_reason = reason;
    return order;
  }

  if (USE_SUPABASE) {
    // First check order status
    const { data: existing } = await supabase.from('orders').select('status').eq('id', id).single();
    if (!existing || (existing.status !== 'pending' && existing.status !== 'paid')) {
      throw new Error('Order cannot be cancelled once it is being prepared or shipped');
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancellation_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Notify admin/staff about the cancellation
    notifyAdminStaff(
      'order.cancelled',
      'Order Cancelled',
      `Order #${String(id).padStart(4, '0')} was cancelled by the customer. Reason: ${reason || 'Not specified'}`,
      id,
      'order'
    );

    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/cancel`, {
    method: 'PUT',
    body: JSON.stringify({ reason }),
  });
  return mapOrderFromApi(data.order ?? data);
};

export const createPaymentIntent = async (amount, items, currency = 'php') => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { clientSecret: 'mock_secret_' + Math.random() };
  }

  return authenticatedFetch(`${API_URL}/checkout/create-payment-intent`, {
    method: 'POST',
    body: JSON.stringify({ amount, items, currency }),
  });
};

// ==================== DASHBOARD STATS ====================

export const getDashboardStats = async () => {
  if (USE_SUPABASE) {
    // Get orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total_amount, status, created_at');

    // Get products
    const { data: products } = await supabase
      .from('products')
      .select('id, stock_quantity, low_stock_threshold');

    const totalRevenue = (orders || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const totalOrders = orders?.length || 0;
    const totalProducts = products?.length || 0;
    const lowStockProducts = (products || []).filter(p => p.stock_quantity <= p.low_stock_threshold).length;

    // Get recent orders with items
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      totalRevenue,
      totalOrders,
      totalProducts,
      lowStockProducts,
      recentOrders: (recentOrders || []).map((order) => ({
        ...mapOrderFromApi(order),
        items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
          ...item,
          product: item.products
        })),
      })),
    };
  }

  await new Promise(resolve => setTimeout(resolve, 300));

  const totalRevenue = MOCK_ORDERS.reduce((sum, order) => sum + order.total_amount, 0);
  const totalOrders = MOCK_ORDERS.length;
  const totalProducts = MOCK_PRODUCTS.length;
  const lowStockProducts = MOCK_PRODUCTS.filter(p => p.stock_quantity <= p.low_stock_threshold).length;

  return {
    totalRevenue,
    totalOrders,
    totalProducts,
    lowStockProducts,
    recentOrders: MOCK_ORDERS.slice(-5).reverse(),
  };
};

// ==================== ADDRESSES ====================

export const getAddresses = async (userId) => {
  const mapAddress = (address) => ({
    ...address,
    recipient_name: address?.recipient_name ?? address?.name ?? '',
    name: address?.name ?? address?.recipient_name ?? '',
    postal_code: address?.postal_code ?? address?.zip ?? '',
    zip: address?.zip ?? address?.postal_code ?? '',
    country: address?.country || 'Philippines',
    label: address?.label || 'Home',
    barangay: address?.barangay ?? '',
    lat: address?.lat ?? null,
    lng: address?.lng ?? null,
  });

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    const { data: addressData, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('is_default', { ascending: false });

    if (error) throw new Error(error.message);
    return (addressData || []).map(mapAddress);
  }

  const data = await authenticatedFetch(`${API_URL}/addresses`);
  return (data || []).map(mapAddress);
};

export const addAddress = async (address) => {
  const payload = {
    recipient_name: address.recipient_name ?? address.name,
    phone: address.phone,
    street: address.street,
    barangay: address.barangay ?? null,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code ?? address.zip,
    country: 'Philippines',
    is_default: !!address.is_default,
    lat: address.lat ?? null,
    lng: address.lng ?? null,
  };

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    if (payload.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', currentUser.id);
    }

    const insertWithPayload = async (nextPayload) => {
      const { data, error } = await supabase
        .from('addresses')
        .insert({ ...nextPayload, user_id: currentUser.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    };

    let data;
    try {
      data = await insertWithPayload(payload);
    } catch (err) {
      if (String(err?.message || err).includes("Could not find the 'country' column")) {
        const { country, ...withoutCountry } = payload;
        data = await insertWithPayload(withoutCountry);
      } else {
        throw err;
      }
    }

    return {
      ...data,
      name: data.recipient_name ?? '',
      zip: data.postal_code ?? '',
      country: data.country || 'Philippines',
      label: data.label || 'Home',
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/addresses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    ...data.address,
    name: data.address?.recipient_name ?? '',
    zip: data.address?.postal_code ?? '',
    country: data.address?.country || 'Philippines',
    label: data.address?.label || 'Home',
    lat: data.address?.lat ?? null,
    lng: data.address?.lng ?? null,
  };
};

export const updateAddress = async (id, updates) => {
  const payload = {
    recipient_name: updates.recipient_name ?? updates.name,
    phone: updates.phone,
    street: updates.street,
    barangay: updates.barangay ?? null,
    city: updates.city,
    state: updates.state,
    postal_code: updates.postal_code ?? updates.zip,
    country: 'Philippines',
    is_default: updates.is_default,
    lat: updates.lat ?? null,
    lng: updates.lng ?? null,
  };

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    if (payload.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', currentUser.id)
        .neq('id', id);
    }

    const updateWithPayload = async (nextPayload) => {
      const { data, error } = await supabase
        .from('addresses')
        .update(nextPayload)
        .eq('id', id)
        .eq('user_id', currentUser.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    };

    let data;
    try {
      data = await updateWithPayload(payload);
    } catch (err) {
      if (String(err?.message || err).includes("Could not find the 'country' column")) {
        const { country, ...withoutCountry } = payload;
        data = await updateWithPayload(withoutCountry);
      } else {
        throw err;
      }
    }

    return {
      ...data,
      name: data.recipient_name ?? '',
      zip: data.postal_code ?? '',
      country: data.country || 'Philippines',
      label: data.label || 'Home',
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return {
    ...data.address,
    name: data.address?.recipient_name ?? '',
    zip: data.address?.postal_code ?? '',
    country: data.address?.country || 'Philippines',
    label: data.address?.label || 'Home',
    lat: data.address?.lat ?? null,
    lng: data.address?.lng ?? null,
  };
};

export const deleteAddress = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return;
  }

  await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'DELETE',
  });
};

// ==================== RETURNS & REFUNDS ====================

export const getMyReturns = async () => {
  const data = await authenticatedFetch(`${API_URL}/returns/my-returns`);
  return data;
};

export const getReturns = async () => {
  const data = await authenticatedFetch(`${API_URL}/returns`);
  return data;
};

export const createReturn = async (returnRequest) => {
  const data = await authenticatedFetch(`${API_URL}/returns`, {
    method: 'POST',
    body: JSON.stringify(returnRequest),
  });

  // Notify admin/staff about new return request
  notifyAdminStaff(
    'return.new',
    'New Return Request',
    `Return request for Order #${String(returnRequest.order_id).padStart(4, '0')}`,
    data.return?.id,
    'return'
  );

  return data.return;
};

export const updateReturnStatus = async (id, status) => {
  const endpoint = status === 'approved' ? 'approve' : 'reject';
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/${endpoint}`, {
    method: 'PUT',
  });
  return data.return;
};

export const processRefund = async (id, method) => {
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
  return data;
};

export const getUserStoreCredit = async () => {
  const data = await authenticatedFetch(`${API_URL}/returns/store-credit`);
  return data;
};

// ==================== SUPPORT TICKETS ====================

export const getTickets = async () => {
  const data = await authenticatedFetch(`${API_URL}/support/my-tickets`);
  return data;
};

export const createTicket = async (ticket) => {
  const result = await authenticatedFetch(`${API_URL}/support`, {
    method: 'POST',
    body: JSON.stringify(ticket),
  });
  return result.ticket;
};

export const updateTicketStatus = async (id, status) => {
  const data = await authenticatedFetch(`${API_URL}/support/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.ticket;
};

// ==================== FAQs ====================

export const getFAQs = async (adminMode = false) => {
  if (USE_SUPABASE) {
    let query = supabase.from('faqs').select('*');
    if (!adminMode) query = query.eq('is_active', true);
    query = query.order('display_order', { ascending: true }).order('created_at', { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }
  if (adminMode) {
    return authenticatedFetch(`${API_URL}/faqs/admin/all`);
  }
  const data = await fetch(`${API_URL}/faqs`);
  if (!data.ok) {
    throw new Error('Failed to fetch FAQs');
  }
  return data.json();
};

export const createFAQ = async (faq) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('faqs').insert({
      question: faq.question,
      answer: faq.answer,
      is_active: faq.is_active !== undefined ? faq.is_active : true,
      display_order: faq.display_order || 0,
    }).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('faq.create', 'faq', data.id, { question: faq.question });
    return data;
  }
  const data = await authenticatedFetch(`${API_URL}/faqs`, {
    method: 'POST',
    body: JSON.stringify(faq),
  });
  return data.faq;
};

export const updateFAQ = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('faqs').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('faq.update', 'faq', id, { updates });
    return data;
  }
  const data = await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.faq;
};

export const deleteFAQ = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('faqs').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('faq.delete', 'faq', id);
    return;
  }
  await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'DELETE',
  });
};

// ==================== POLICIES ====================

export const getPolicy = async (type) => {
  const data = await fetch(`${API_URL}/policies/${type}`);
  if (data.status === 404) {
    // Policy doesn't exist yet â€” return empty for initial creation
    return { title: '', content: '' };
  }
  if (!data.ok) {
    throw new Error('Failed to fetch policy');
  }
  return data.json();
};

export const updatePolicy = async (type, title, content) => {
  if (USE_SUPABASE) {
    const { data: existing } = await supabase.from('policies').select('id').eq('type', type).single();
    let result;
    if (existing) {
      const { data, error } = await supabase.from('policies').update({ title, content, updated_at: new Date().toISOString() }).eq('type', type).select().single();
      if (error) throw new Error(error.message);
      result = data;
    } else {
      const { data, error } = await supabase.from('policies').insert({ type, title, content }).select().single();
      if (error) throw new Error(error.message);
      result = data;
    }
    await logSupabaseActivity('policy.update', 'policy', result.id, { type, title });
    return result;
  }
  const data = await authenticatedFetch(`${API_URL}/policies/${type}`, {
    method: 'PUT',
    body: JSON.stringify({ title, content }),
  });
  return data.policy;
};

// ==================== Additional Mock Functions (Future sprints) ====================

export const getWishlist = async (userId) => {
  const normalizeWishlistItem = (item) => {
    const product = item.product || item.products || {};
    const productId = item.product_id ?? product.id ?? item.id;
    const price = Number(item.price ?? product.price ?? 0);
    const salePrice = item.sale_price ?? product.sale_price ?? null;
    const stockQuantity = item.stock_quantity ?? product.stock_quantity ?? 0;

    return {
      ...item,
      id: productId,
      product,
      product_id: productId,
      name: item.name ?? item.product_name ?? product.name ?? 'Unknown Product',
      product_name: item.product_name ?? item.name ?? product.name ?? 'Unknown Product',
      price,
      sale_price: salePrice,
      image_url: item.image_url ?? product.image_url ?? product.image ?? '',
      stock_quantity: stockQuantity,
      in_stock: item.in_stock ?? stockQuantity > 0,
    };
  };

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data, error } = await supabase
      .from('wishlists')
      .select('*, products(*)')
      .eq('user_id', currentUser.id);
    if (error) return [];
    return (data || []).map((w) => normalizeWishlistItem({ ...w, product: w.products }));
  }
  const rows = await authenticatedFetch(`${API_URL}/wishlist`).catch(() => []);
  return (rows || []).map(normalizeWishlistItem);
};

export const WISHLIST_SYNC_EVENT = 'shopcore:wishlist-changed';

const emitWishlistChange = ({ userId, productId, isWishlisted }) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WISHLIST_SYNC_EVENT, {
      detail: { userId, productId, isWishlisted }
    }));
  }

  try {
    localStorage.setItem('shopCoreWishlistSync', JSON.stringify({
      userId,
      productId,
      isWishlisted,
      timestamp: new Date().toISOString(),
    }));
  } catch {}
};

export const addToWishlist = async (userId, productId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return {};
    const { data, error } = await supabase
      .from('wishlists')
      .insert({ user_id: currentUser.id, product_id: productId })
      .select()
      .single();
    if (error && error.code !== '23505') throw new Error(error.message);
    emitWishlistChange({ userId: currentUser.id, productId, isWishlisted: true });
    return data;
  }
  const result = await authenticatedFetch(`${API_URL}/wishlist`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });
  emitWishlistChange({ userId, productId, isWishlisted: true });
  return result;
};

export const removeFromWishlist = async (userId, productId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return;
    await supabase.from('wishlists').delete().eq('user_id', currentUser.id).eq('product_id', productId);
    emitWishlistChange({ userId: currentUser.id, productId, isWishlisted: false });
    return;
  }
  const result = await authenticatedFetch(`${API_URL}/wishlist/${productId}`, { method: 'DELETE' });
  emitWishlistChange({ userId, productId, isWishlisted: false });
  return result;
};

export const getReviews = async (productId) => {
  const normalizedProductId = Number(productId);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    return [];
  }

  const currentUser = getCurrentUserFromToken();
  const currentUserId = Number(currentUser?.id || 0);

  if (USE_SUPABASE) {
    const backendReviews = await authenticatedFetch(`${API_URL}/products/${normalizedProductId}/reviews`).catch(() => null);

    if (Array.isArray(backendReviews)) {
      return backendReviews.map((review) => mapReviewForDisplay(review, { currentUser, currentUserId }));
    }

    const { data: reviewRows, error: reviewError } = await supabase
      .from('reviews')
      .select('id, user_id, product_id, rating, comment, created_at, updated_at, review_status, is_approved, media_urls')
      .eq('product_id', normalizedProductId)
      .order('created_at', { ascending: false });

    if (reviewError) {
      throw new Error(reviewError.message);
    }

    const visibleRows = reviewRows || [];

    if (visibleRows.length === 0) {
      return [];
    }

    const userIds = [...new Set(visibleRows.map((review) => Number(review.user_id)).filter((id) => Number.isInteger(id) && id > 0))];
    let userMap = new Map();

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, avatar')
        .in('id', userIds);

      if (!usersError) {
        userMap = new Map((users || []).map((user) => [Number(user.id), user]));
      }
    }

    return visibleRows.map((review) => {
      const user = userMap.get(Number(review.user_id));
      return mapReviewForDisplay(review, { currentUser, currentUserId, user });
    });
  }

  return authenticatedFetch(`${API_URL}/products/${normalizedProductId}/reviews`).catch(() => []);
};
export const getProductReviews = getReviews;

export const addReview = async (review) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser?.id) {
      const authError = new Error('Please log in to leave a review.');
      authError.status = 401;
      throw authError;
    }

    const productId = Number(review?.product_id ?? review?.productId);
    const rating = Number(review?.rating);
    const comment = typeof review?.comment === 'string' ? review.comment.trim() : '';
    const reviewMediaFiles = Array.isArray(review?.media) ? review.media : [];
    const fieldErrors = {};

    if (!Number.isInteger(productId) || productId <= 0) {
      fieldErrors.product = 'Invalid product.';
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      fieldErrors.rating = 'Please select a rating from 1 to 5.';
    }

    if (!comment) {
      fieldErrors.comment = 'Please enter a review comment.';
    } else if (comment.length < 5) {
      fieldErrors.comment = 'Review comment must be at least 5 characters.';
    } else if (comment.length > 1000) {
      fieldErrors.comment = 'Review comment must be 1000 characters or fewer.';
    }

    if (reviewMediaFiles.length > REVIEW_MEDIA_MAX_FILES) {
      fieldErrors.media = `You can attach up to ${REVIEW_MEDIA_MAX_FILES} files per review.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      const validationError = new Error('Please correct the highlighted review fields.');
      validationError.status = 400;
      validationError.fieldErrors = fieldErrors;
      throw validationError;
    }

    let mediaUrls = parseReviewMediaPayload(review);

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      throw new Error(productError.message);
    }

    if (!product) {
      const notFoundError = new Error('Product not found.');
      notFoundError.status = 404;
      throw notFoundError;
    }

    await assertSupabaseReviewEligibility({
      userId: currentUser.id,
      productId,
    });

    if (reviewMediaFiles.length > 0) {
      try {
        mediaUrls = await uploadReviewMediaFiles({
          files: reviewMediaFiles,
          userId: currentUser.id,
          productId,
        });
      } catch (mediaError) {
        const uploadError = new Error(mediaError?.message || 'Failed to upload review media.');
        uploadError.status = 400;
        uploadError.fieldErrors = {
          media: uploadError.message,
        };
        throw uploadError;
      }
    }

    const { data: insertedReview, error: insertError } = await supabase
      .from('reviews')
      .insert({
        user_id: currentUser.id,
        product_id: productId,
        rating,
        comment,
        media_urls: mediaUrls,
        review_status: 'pending',
        is_approved: false,
      })
      .select('id, user_id, product_id, rating, comment, created_at, updated_at, review_status, is_approved, media_urls')
      .single();

    if (insertError) {
      if (String(insertError.message || '').toLowerCase().includes('media_urls')) {
        throw new Error('Review media column is missing. Run the latest database migration first.');
      }
      throw new Error(insertError.message);
    }

    const savedReview = insertedReview;

    return {
      message: 'Review submitted and is pending moderation.',
      review: {
        ...savedReview,
        rating: Number(savedReview.rating || 0),
        review_status: toApprovedReviewStatus(savedReview),
        media_urls: normalizeReviewMedia(savedReview.media_urls),
        verified_purchase: true,
        is_mine: true,
      },
    };
  }

  const productId = Number(review?.product_id ?? review?.productId);
  const reviewMediaFiles = Array.isArray(review?.media) ? review.media : [];
  let mediaUrls = parseReviewMediaPayload(review);

  if (reviewMediaFiles.length > 0) {
    mediaUrls = await uploadReviewMediaFiles({
      files: reviewMediaFiles,
      userId: 0,
      productId,
    });
  }

  const reviewPayload = {
    ...review,
    media_urls: mediaUrls,
  };
  delete reviewPayload.media;

  return authenticatedFetch(`${API_URL}/reviews`, {
    method: 'POST',
    body: JSON.stringify(reviewPayload),
  });
};

export const getReviewModerationQueue = async (status = 'pending') => (
  authenticatedFetch(`${API_URL}/reviews/moderation?status=${encodeURIComponent(status)}`)
);

export const moderateReview = async (reviewId, payload) => (
  authenticatedFetch(`${API_URL}/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
);

export const getDiscounts = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('discounts').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/discounts`).catch(() => []);
};

export const validateDiscount = async (code, amount) => {
  if (USE_SUPABASE) {
    const { data } = await supabase
      .from('discounts')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();
    if (!data) throw new Error('Invalid discount code');
    // Only enforce min_purchase if it's set and greater than 0
    if (data.min_purchase && parseFloat(data.min_purchase) > 0 && amount < parseFloat(data.min_purchase)) {
      throw new Error(`Minimum purchase of â‚±${parseFloat(data.min_purchase).toLocaleString()} required`);
    }
    if (data.max_uses && data.max_uses > 0 && data.used_count >= data.max_uses) throw new Error('Discount code usage limit reached');
    if (data.expires_at && new Date(data.expires_at) < new Date()) throw new Error('Discount code has expired');
    if (data.starts_at && new Date(data.starts_at) > new Date()) throw new Error('Discount code is not yet active');
    const discountAmount = data.type === 'percentage' ? (amount * parseFloat(data.value) / 100) : parseFloat(data.value);
    return { valid: true, discount: data, discountAmount: Math.min(discountAmount, amount) };
  }
  return authenticatedFetch(`${API_URL}/discounts/validate`, {
    method: 'POST',
    body: JSON.stringify({ code, amount }),
  });
};
export const validateDiscountCode = validateDiscount;

export const createDiscount = async (discount) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('discounts').insert(discount).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('discount.create', 'discount', data.id, { code: discount.code });
    return data;
  }
  return authenticatedFetch(`${API_URL}/discounts`, { method: 'POST', body: JSON.stringify(discount) });
};

export const deleteDiscount = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('discounts').delete().eq('id', id);
    await logSupabaseActivity('discount.delete', 'discount', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/discounts/${id}`, { method: 'DELETE' });
};

export const getPromotions = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners`).catch(() => []);
};

// ==================== SUPPLIERS ====================

export const getSuppliers = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/suppliers`).catch(() => []);
};

export const addSupplier = async (supplier) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('suppliers').insert(supplier).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('supplier.create', 'supplier', data.id, { name: supplier.name });
    return data;
  }
  return authenticatedFetch(`${API_URL}/suppliers`, { method: 'POST', body: JSON.stringify(supplier) });
};
export const createSupplier = addSupplier;

export const updateSupplier = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('supplier.update', 'supplier', id, { updates });
    return data;
  }
  return authenticatedFetch(`${API_URL}/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteSupplier = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('suppliers').delete().eq('id', id);
    await logSupabaseActivity('supplier.delete', 'supplier', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/suppliers/${id}`, { method: 'DELETE' });
};

// ==================== SUBCATEGORIES ====================

export const getSubcategories = async (categoryId) => {
  if (USE_SUPABASE) {
    let query = supabase.from('subcategories').select('*, categories(name)');
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data } = await query.order('name');
    return data || [];
  }
  const url = categoryId ? `${API_URL}/subcategories/category/${categoryId}` : `${API_URL}/subcategories`;
  return authenticatedFetch(url).catch(() => []);
};

export const addSubcategory = async (subcategory) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('subcategories').insert(subcategory).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('subcategory.create', 'subcategory', data.id, { name: subcategory.name });
    return data;
  }
  return authenticatedFetch(`${API_URL}/subcategories`, { method: 'POST', body: JSON.stringify(subcategory) });
};

export const updateSubcategory = async (id, name) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('subcategories').update({ name }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('subcategory.update', 'subcategory', id, { name });
    return data;
  }
  return authenticatedFetch(`${API_URL}/subcategories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
};

export const deleteSubcategory = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('subcategories').delete().eq('id', id);
    await logSupabaseActivity('subcategory.delete', 'subcategory', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/subcategories/${id}`, { method: 'DELETE' });
};

// ==================== PRODUCT VARIANTS ====================

const normalizeVariantOptionName = (value) => String(value || '').trim().slice(0, 50);
const normalizeVariantOptionValue = (value) => String(value || '').trim().slice(0, 100);

const normalizeVariantToken = (value, fallback = 'x') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
};

const buildVariantCombinationKey = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${normalizeVariantToken(optionName, 'opt')}:${normalizeVariantToken(optionCombination?.[optionName], 'val')}`)
  .join('|');

const formatVariantCombinationLabel = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${optionName}: ${optionCombination?.[optionName] || ''}`)
  .join(' / ')
  .slice(0, 100);

const parseVariantOptionValues = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/[\n,|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeVariantOptionsPayload = (value) => {
  if (!Array.isArray(value)) return [];

  const optionNameSet = new Set();

  return value
    .map((option) => {
      const name = normalizeVariantOptionName(option?.name ?? option?.label ?? option?.option_name);
      if (!name) return null;

      const nameToken = name.toLowerCase();
      if (optionNameSet.has(nameToken)) return null;
      optionNameSet.add(nameToken);

      const valueSet = new Set();
      const values = parseVariantOptionValues(option?.values ?? option?.option_values)
        .map((rawValue) => normalizeVariantOptionValue(rawValue))
        .filter(Boolean)
        .filter((rawValue) => {
          const valueToken = rawValue.toLowerCase();
          if (valueSet.has(valueToken)) return false;
          valueSet.add(valueToken);
          return true;
        });

      if (values.length === 0) return null;
      return { name, values };
    })
    .filter(Boolean)
    .slice(0, 5);
};

const normalizeVariantCombinationMap = (value, optionOrder = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const normalized = {};

  if (optionOrder.length > 0) {
    optionOrder.forEach((optionName) => {
      const optionValue = normalizeVariantOptionValue(value?.[optionName]);
      if (!optionValue) return;
      normalized[optionName] = optionValue;
    });
  }

  if (Object.keys(normalized).length === 0) {
    Object.entries(value).forEach(([rawName, rawValue]) => {
      const optionName = normalizeVariantOptionName(rawName);
      const optionValue = normalizeVariantOptionValue(rawValue);
      if (!optionName || !optionValue) return;
      normalized[optionName] = optionValue;
    });
  }

  return normalized;
};

const deriveVariantOptionsFromRows = (rows = []) => {
  const optionOrder = [];
  const optionValuesMap = new Map();

  rows.forEach((row) => {
    let optionCombination = row?.option_combination;
    if (!optionCombination || typeof optionCombination !== 'object' || Array.isArray(optionCombination)) {
      if (row?.variant_type && row?.variant_value) {
        optionCombination = {
          [normalizeVariantOptionName(row.variant_type) || 'Option']:
            normalizeVariantOptionValue(row.variant_value) || 'Default',
        };
      } else {
        return;
      }
    }

    Object.entries(optionCombination).forEach(([rawName, rawValue]) => {
      const optionName = normalizeVariantOptionName(rawName);
      const optionValue = normalizeVariantOptionValue(rawValue);
      if (!optionName || !optionValue) return;

      if (!optionValuesMap.has(optionName)) {
        optionValuesMap.set(optionName, []);
        optionOrder.push(optionName);
      }

      const values = optionValuesMap.get(optionName);
      if (!values.includes(optionValue)) {
        values.push(optionValue);
      }
    });
  });

  return optionOrder.map((name) => ({ name, values: optionValuesMap.get(name) || [] }));
};

const normalizeVariantRowsPayload = (rows, options = [], fallbackPrice = 0) => {
  if (!Array.isArray(rows)) return [];

  const optionOrder = options.map((option) => option.name);
  const variantsByKey = new Map();

  rows.forEach((row) => {
    const fallbackSingleOption = optionOrder.length === 1
      ? { [optionOrder[0]]: row?.variant_value }
      : null;

    const optionCombination = normalizeVariantCombinationMap(
      row?.option_combination ?? row?.optionValues ?? fallbackSingleOption,
      optionOrder,
    );

    if (Object.keys(optionCombination).length === 0) return;

    const resolvedOrder = optionOrder.length > 0 ? optionOrder : Object.keys(optionCombination);
    const combinationKey = row?.combination_key || buildVariantCombinationKey(optionCombination, resolvedOrder);
    const fallback = Number(fallbackPrice) + Number(row?.price_adjustment ?? row?.additional_price ?? 0);
    const computedPrice = Number(row?.price ?? fallback);
    const safePrice = Number.isFinite(computedPrice) && computedPrice > 0
      ? computedPrice
      : (Number.isFinite(Number(fallbackPrice)) ? Number(fallbackPrice) : 0);
    const stockQuantity = Number(row?.stock_quantity ?? row?.stock ?? 0);

    variantsByKey.set(combinationKey, {
      id: row?.id,
      product_id: row?.product_id,
      option_combination: optionCombination,
      combination_key: combinationKey,
      label: formatVariantCombinationLabel(optionCombination, resolvedOrder),
      price: safePrice,
      stock_quantity: Number.isInteger(stockQuantity) && stockQuantity >= 0 ? stockQuantity : 0,
      image_url: toNullableString(row?.image_url ?? row?.imageUrl),
      sku: toNullableString(row?.sku),
    });
  });

  return Array.from(variantsByKey.values());
};

const normalizeVariantResponsePayload = (payload, fallbackPrice = 0) => {
  const rawVariants = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.variants) ? payload.variants : []);

  const explicitOptions = normalizeVariantOptionsPayload(payload?.options);
  const derivedOptions = deriveVariantOptionsFromRows(rawVariants);
  const options = explicitOptions.length > 0 ? explicitOptions : derivedOptions;
  const variants = normalizeVariantRowsPayload(rawVariants, options, fallbackPrice);

  return {
    product_id: payload?.product_id ?? null,
    options,
    variants,
  };
};

const buildVariantRowsForWrite = ({ productId, basePrice, options, variants }) => {
  const optionOrder = options.map((option) => option.name);

  return normalizeVariantRowsPayload(variants, options, basePrice).map((row) => ({
    product_id: productId,
    variant_type: 'combination',
    variant_value: formatVariantCombinationLabel(row.option_combination, optionOrder.length > 0 ? optionOrder : Object.keys(row.option_combination)),
    price_adjustment: Number.isFinite(Number(basePrice))
      ? Number((Number(row.price) - Number(basePrice)).toFixed(2))
      : null,
    price: Number(row.price),
    option_combination: row.option_combination,
    combination_key: row.combination_key || buildVariantCombinationKey(row.option_combination, optionOrder),
    image_url: toNullableString(row.image_url),
    stock_quantity: Number.isInteger(Number(row.stock_quantity)) ? Number(row.stock_quantity) : 0,
    sku: toNullableString(row.sku),
  }));
};

export const getProductVariants = async (productId) => {
  const normalizedProductId = Number.parseInt(String(productId), 10);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    return { product_id: productId, options: [], variants: [] };
  }

  if (USE_SUPABASE) {
    const [productResult, variantsResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, price, variant_options')
        .eq('id', normalizedProductId)
        .maybeSingle(),
      supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', normalizedProductId)
        .order('created_at', { ascending: true }),
    ]);

    if (productResult.error) throw new Error(productResult.error.message);
    if (variantsResult.error) throw new Error(variantsResult.error.message);

    return normalizeVariantResponsePayload(
      {
        product_id: normalizedProductId,
        options: productResult.data?.variant_options || [],
        variants: variantsResult.data || [],
      },
      Number(productResult.data?.price || 0),
    );
  }

  const payload = await authenticatedFetch(`${API_URL}/variants/product/${normalizedProductId}`).catch(() => ({
    product_id: normalizedProductId,
    options: [],
    variants: [],
  }));

  return normalizeVariantResponsePayload(payload, 0);
};

export const saveProductVariants = async (productId, payload = {}) => {
  const normalizedProductId = Number.parseInt(String(productId), 10);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
    throw new Error('Invalid product id');
  }

  const options = normalizeVariantOptionsPayload(payload?.options);
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];

  if (USE_SUPABASE) {
    const { data: productRow, error: productError } = await supabase
      .from('products')
      .select('id, price')
      .eq('id', normalizedProductId)
      .single();

    if (productError) throw new Error(productError.message);

    const basePrice = Number(productRow?.price || 0);
    const rowsForWrite = buildVariantRowsForWrite({
      productId: normalizedProductId,
      basePrice,
      options,
      variants,
    });

    const { error: updateProductError } = await supabase
      .from('products')
      .update({ variant_options: options })
      .eq('id', normalizedProductId);

    if (updateProductError) throw new Error(updateProductError.message);

    const { error: deleteError } = await supabase
      .from('product_variants')
      .delete()
      .eq('product_id', normalizedProductId);

    if (deleteError) throw new Error(deleteError.message);

    let insertedRows = [];
    if (rowsForWrite.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('product_variants')
        .insert(rowsForWrite)
        .select('*');

      if (insertError) throw new Error(insertError.message);
      insertedRows = inserted || [];
    }

    await logSupabaseActivity('variant.save_matrix', 'product', normalizedProductId, {
      option_count: options.length,
      variant_count: rowsForWrite.length,
    });

    return normalizeVariantResponsePayload(
      {
        product_id: normalizedProductId,
        options,
        variants: insertedRows,
      },
      basePrice,
    );
  }

  const response = await authenticatedFetch(`${API_URL}/variants/product/${normalizedProductId}`, {
    method: 'PUT',
    body: JSON.stringify({ options, variants }),
  });

  return normalizeVariantResponsePayload(response, 0);
};

export const addVariant = async (variant) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('product_variants').insert(variant).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('variant.create', 'product_variant', data.id, { product_id: variant.product_id });
    return data;
  }
  return authenticatedFetch(`${API_URL}/variants`, { method: 'POST', body: JSON.stringify(variant) });
};

export const updateVariant = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('product_variants').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('variant.update', 'product_variant', id, { updates });
    return data;
  }
  return authenticatedFetch(`${API_URL}/variants/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteVariant = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('product_variants').delete().eq('id', id);
    await logSupabaseActivity('variant.delete', 'product_variant', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/variants/${id}`, { method: 'DELETE' });
};

// ==================== NOTIFICATIONS ====================

const normalizeNotification = (notification) => {
  const metadata = notification?.metadata && typeof notification.metadata === 'string'
    ? (() => {
        try { return JSON.parse(notification.metadata); } catch { return null; }
      })()
    : (notification?.metadata ?? null);

  return {
    ...notification,
    metadata,
    thumbnail_url: notification?.thumbnail_url ?? metadata?.thumbnail_url ?? metadata?.product_image ?? null,
  };
};

export const getNotifications = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return (data || []).map(normalizeNotification);
  }
  const data = await authenticatedFetch(`${API_URL}/notifications`).catch(() => []);
  return (data || []).map(normalizeNotification);
};

export const getUnreadNotificationCount = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return 0;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('is_read', false);
    return count || 0;
  }
  const data = await authenticatedFetch(`${API_URL}/notifications/unread-count`).catch(() => ({ count: 0 }));
  return data.count || 0;
};

export const markNotificationRead = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT' });
};

export const markAllNotificationsRead = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/read-all`, { method: 'PUT' });
};

export const deleteNotification = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('notifications').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/${id}`, { method: 'DELETE' });
};

export const createNotification = async ({ user_id, type, title, message, reference_id, reference_type, thumbnail_url = null, metadata = null }) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('notifications').insert({
      user_id, type, title, message, reference_id, reference_type, thumbnail_url, metadata,
    }).select().single();
    if (error) console.error('Notification insert error:', error.message);
    return normalizeNotification(data);
  }
  return authenticatedFetch(`${API_URL}/notifications`, {
    method: 'POST',
    body: JSON.stringify({ user_id, type, title, message, reference_id, reference_type, thumbnail_url, metadata }),
  }).then(normalizeNotification).catch(err => console.error('Notification create error:', err));
};

// Notify all admin (owner) and staff users
const notifyAdminStaff = async (type, title, message, referenceId = null, referenceType = null) => {
  try {
    const { data: staffUsers } = await supabase
      .from('users')
      .select('id')
      .in('role', ['owner', 'store_staff', 'super_admin'])
      .eq('is_active', true);
    if (!staffUsers || staffUsers.length === 0) return;
    const rows = staffUsers.map(u => ({
      user_id: u.id, type, title, message,
      reference_id: referenceId, reference_type: referenceType,
    }));
    await supabase.from('notifications').insert(rows);
  } catch (err) {
    console.error('notifyAdminStaff error:', err.message);
  }
};

// ==================== BANNERS ====================

export const getBanners = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners`).catch(() => []);
};

export const getAllBanners = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners/all`).catch(() => []);
};

export const createBanner = async (banner) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('banners').insert(banner).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('banner.create', 'banner', data.id, { title: banner.title });
    return data;
  }
  return authenticatedFetch(`${API_URL}/banners`, { method: 'POST', body: JSON.stringify(banner) });
};

export const updateBanner = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('banners').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('banner.update', 'banner', id, { updates });
    return data;
  }
  return authenticatedFetch(`${API_URL}/banners/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteBanner = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('banners').delete().eq('id', id);
    await logSupabaseActivity('banner.delete', 'banner', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/banners/${id}`, { method: 'DELETE' });
};

// ==================== ANNOUNCEMENTS ====================

const ANNOUNCEMENTS_SETTINGS_CATEGORY = 'home';
const ANNOUNCEMENTS_SETTINGS_KEY = 'announcements_enabled';

const parseBooleanSetting = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return fallback;
};

export const getAnnouncementToggle = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('category', ANNOUNCEMENTS_SETTINGS_CATEGORY)
      .eq('key', ANNOUNCEMENTS_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load announcement toggle from system settings:', error.message);
      return true;
    }

    return parseBooleanSetting(data?.value, true);
  }

  try {
    const response = await authenticatedFetch(`${API_URL}/announcements/toggle`);
    return parseBooleanSetting(response?.enabled, true);
  } catch {
    // Fail open for management views if endpoint is temporarily unreachable.
    return true;
  }
};

export const updateAnnouncementToggle = async (enabled) => {
  const normalizedEnabled = Boolean(enabled);

  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          category: ANNOUNCEMENTS_SETTINGS_CATEGORY,
          key: ANNOUNCEMENTS_SETTINGS_KEY,
          value: String(normalizedEnabled),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'category,key' },
      );

    if (error) throw new Error(error.message);
    await logSupabaseActivity('announcement.toggle_visibility', 'system_settings', null, { enabled: normalizedEnabled });
    return { enabled: normalizedEnabled };
  }

  return authenticatedFetch(`${API_URL}/announcements/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: normalizedEnabled }),
  });
};

export const getAnnouncements = async () => {
  if (USE_SUPABASE) {
    const enabled = await getAnnouncementToggle();
    if (!enabled) return [];

    const { data } = await supabase.from('announcements').select('*').eq('is_published', true).order('published_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/announcements`).catch(() => []);
};

export const getAllAnnouncements = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/announcements/all`).catch(() => []);
};

export const createAnnouncement = async (announcement) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('announcements').insert(announcement).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('announcement.create', 'announcement', data.id, { title: announcement.title });
    return data;
  }
  return authenticatedFetch(`${API_URL}/announcements`, { method: 'POST', body: JSON.stringify(announcement) });
};

export const updateAnnouncement = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('announcements').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('announcement.update', 'announcement', id, { updates });
    return data;
  }
  return authenticatedFetch(`${API_URL}/announcements/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteAnnouncement = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('announcements').delete().eq('id', id);
    await logSupabaseActivity('announcement.delete', 'announcement', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/announcements/${id}`, { method: 'DELETE' });
};

// ==================== STOCK ADJUSTMENTS ====================

export const getPurchaseOrders = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('stock_adjustments').select('*, products(name), users!stock_adjustments_adjusted_by_fkey(name)').order('created_at', { ascending: false });
    return (data || []).map(a => ({ ...a, product_name: a.products?.name, quantity: a.quantity_change }));
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments`).catch(() => []);
};

export const createPurchaseOrder = async (po) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    // Map frontend reasons to DB-valid values
    const reasonMap = { restock: 'received', returned: 'correction', shrinkage: 'lost', other: 'correction' };
    const dbReason = reasonMap[po.reason] || po.reason || 'correction';
    // Get current product stock
    const { data: product, error: prodErr } = await supabase.from('products').select('stock_quantity').eq('id', po.product_id).single();
    if (prodErr) throw new Error(prodErr.message);
    const currentStock = parseInt(product.stock_quantity);
    const newStock = currentStock + po.quantity_change;
    if (newStock < 0) throw new Error('Stock cannot go below zero');
    // Update product stock
    const { error: updateErr } = await supabase.from('products').update({ stock_quantity: newStock, updated_at: new Date().toISOString() }).eq('id', po.product_id);
    if (updateErr) throw new Error(updateErr.message);
    // Record adjustment
    const { data, error } = await supabase.from('stock_adjustments').insert({ product_id: po.product_id, quantity_change: po.quantity_change, reason: dbReason, notes: po.note || '', adjusted_by: currentUser?.id, status: 'approved' }).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('inventory.adjust', 'product', po.product_id, { quantity_change: po.quantity_change, reason: dbReason });

    // Check for low stock after adjustment and notify
    if (newStock <= (po.low_stock_threshold || 5)) {
      const { data: prodInfo } = await supabase.from('products').select('name, low_stock_threshold').eq('id', po.product_id).single();
      const prodName = prodInfo?.name || `Product #${po.product_id}`;
      const threshold = prodInfo?.low_stock_threshold || 5;
      if (newStock <= threshold) {
        notifyAdminStaff(
          'inventory.low_stock',
          'Low Stock Alert',
          `${prodName} is low on stock (${newStock} remaining, threshold: ${threshold})`,
          po.product_id,
          'product'
        );
      }
    }

    return data;
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments`, { method: 'POST', body: JSON.stringify(po) });
};

export const receivePurchaseOrder = async (id) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    const { data, error } = await supabase.from('stock_adjustments').update({ status: 'approved', approved_by: currentUser?.id }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('inventory.approve', 'stock_adjustment', id);
    return data;
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments/${id}/approve`, { method: 'PUT' });
};

export const getStockAdjustments = async () => getPurchaseOrders();
export const createStockAdjustment = async (adjustment) => createPurchaseOrder(adjustment);
export const adjustStock = createStockAdjustment;

// ==================== SHIPPING ====================

export const getShippingRates = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('shipping_rates').select('*').eq('is_active', true).order('base_fee');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/shipping/rates`).catch(() => [
    { id: 1, method: 'standard', label: 'Standard Shipping', base_fee: 0, min_purchase_free: 2500, estimated_days: '5-7 days', is_active: true },
    { id: 2, method: 'express', label: 'Express Shipping', base_fee: 300, min_purchase_free: null, estimated_days: '1-2 days', is_active: true },
    { id: 3, method: 'pickup', label: 'Store Pickup', base_fee: 0, min_purchase_free: 0, estimated_days: 'Same day', is_active: true },
  ]);
};

export const updateTrackingNumber = async (orderId, trackingData) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('orders').update(trackingData).eq('id', orderId).select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('order.update_tracking', 'order', orderId, trackingData);
    return data;
  }
  return authenticatedFetch(`${API_URL}/shipping/tracking/${orderId}`, { method: 'PUT', body: JSON.stringify(trackingData) });
};

// ==================== DEVICE HISTORY ====================

export const getDeviceHistory = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data } = await supabase.from('device_history').select('*').eq('user_id', currentUser.id).order('login_at', { ascending: false }).limit(20);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/auth/device-history`).catch(() => []);
};

// ==================== ACTIVITY LOGS (AUDIT) ====================

export const getAuditLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('activity_logs').select('*, users(name, email)').order('created_at', { ascending: false });
    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.action) query = query.eq('action', params.action);
    const { data } = await query.limit(params.limit || 100);
    return data || [];
  }
  return getActivityLogs(params);
};

// Address aliases
export const saveAddress = async (address) => {
  if (address.id) {
    return updateAddress(address.id, address);
  } else {
    return addAddress(address);
  }
};

// Product aliases and extensions
export const createProduct = addProduct; // Alias
export const getRelatedProducts = async (productId, categoryId) => {
  const products = await getProducts();
  return products.filter(p => p.category_id === categoryId && p.id !== productId).slice(0, 4);
};
export const recordProductView = async (productId) => {
  // Mock implementation - would track views in real app
  return Promise.resolve();
};

// User profile functions
export const updateProfile = async (userId, updates) => {
  const name = typeof updates?.name === 'string' ? updates.name.trim() : '';
  const email = typeof updates?.email === 'string' ? updates.email.trim().toLowerCase() : '';
  const rawPhone = typeof updates?.phone === 'string' ? updates.phone.trim() : '';
  const normalizedPhone = normalizeProfilePhone(rawPhone);
  const fieldErrors = {};

  if (!name) {
    fieldErrors.name = 'Name is required.';
  } else if (name.length < 2) {
    fieldErrors.name = 'Name must be at least 2 characters.';
  } else if (name.length > 100) {
    fieldErrors.name = 'Name must be 100 characters or fewer.';
  }

  const emailError = getRegistrationEmailError(email);
  if (emailError) {
    fieldErrors.email = emailError;
  }

  const phoneError = getProfilePhoneError(rawPhone);
  if (phoneError) {
    fieldErrors.phone = phoneError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    const validationError = new Error('Please correct the highlighted fields.');
    validationError.fieldErrors = fieldErrors;
    throw validationError;
  }

  const payload = {
    name,
    email,
    phone: normalizedPhone || null,
  };

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'avatar')) {
    payload.avatar = updates?.avatar || null;
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser?.id) throw new Error('Not authenticated');

    const { data: emailOwner, error: emailOwnerError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .neq('id', currentUser.id)
      .maybeSingle();

    if (emailOwnerError) throw new Error(emailOwnerError.message);
    if (emailOwner?.id) {
      const duplicateError = new Error('That email address is already in use.');
      duplicateError.fieldErrors = { email: 'That email address is already in use.' };
      throw duplicateError;
    }

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', currentUser.id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    const user = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      phone: data.phone,
      avatar: data.avatar,
      store_credit: data.store_credit,
      is_active: data.is_active,
      last_login: data.last_login,
      email_verified: data.email_verified,
      two_factor_enabled: data.two_factor_enabled,
    };

    return {
      user,
      message: 'Profile updated successfully',
      requiresEmailVerification: false,
      pending_email: null,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/users/profile`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return {
    user: data.user,
    message: data.message || 'Profile updated successfully',
    requiresEmailVerification: Boolean(data.requiresEmailVerification),
    pending_email: data.pending_email || null,
  };
};

export const uploadProfileAvatar = async (file) => {
  if (!file) throw new Error('Image file is required.');

  const token = getAuthToken();
  if (!token) throw new Error('You must be logged in to upload a profile picture.');

  const data = await authenticatedFetch(`${API_URL}/users/profile/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  const rawAvatarUrl = data.avatarUrl || data?.user?.avatar || '';
  const avatarUrl = rawAvatarUrl.startsWith('/') ? `${API_ORIGIN}${rawAvatarUrl}` : rawAvatarUrl;
  if (!avatarUrl) throw new Error('Profile picture upload failed.');

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (currentUser?.id) {
      const { error } = await supabase
        .from('users')
        .update({ avatar: avatarUrl })
        .eq('id', currentUser.id);

      if (error) {
        throw new Error(error.message || 'Profile picture uploaded but failed to sync profile avatar.');
      }
    }
  }

  return avatarUrl;
};

// ==================== INVENTORY ====================

export const getInventory = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .order('stock_quantity', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((p) => ({
      ...p,
      partNumber: p.part_number,
      buyingPrice: p.buying_price,
      boxNumber: p.box_number,
      category_name: p.categories?.name,
      stock_quantity: parseInt(p.stock_quantity),
      low_stock_threshold: parseInt(p.low_stock_threshold),
      price: parseFloat(p.price),
      buying_price: parseFloat(p.buying_price || 0),
      sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
      stock_status: p.stock_quantity === 0 ? 'out_of_stock' : p.stock_quantity <= p.low_stock_threshold ? 'low_stock' : 'in_stock',
    }));
  }
  const data = await authenticatedFetch(`${API_URL}/inventory`);
  return data.map((p) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
  }));
};

export const getLowStockProducts = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .order('stock_quantity', { ascending: true });
    if (error) throw new Error(error.message);
    const lowItems = (data || []).filter(p => parseInt(p.stock_quantity) <= parseInt(p.low_stock_threshold)).map((p) => ({
      ...p,
      partNumber: p.part_number,
      buyingPrice: p.buying_price,
      boxNumber: p.box_number,
      category_name: p.categories?.name,
      stock_quantity: parseInt(p.stock_quantity),
      low_stock_threshold: parseInt(p.low_stock_threshold),
      price: parseFloat(p.price),
      buying_price: parseFloat(p.buying_price || 0),
    }));
    return { count: lowItems.length, products: lowItems };
  }
  const data = await authenticatedFetch(`${API_URL}/inventory/low-stock`);
  return {
    count: data.count,
    products: data.products.map((p) => ({
      ...p,
      partNumber: p.part_number,
      buyingPrice: p.buying_price,
      boxNumber: p.box_number,
    }))
  };
};

export const updateStock = async (productId, quantity, adjustmentType = 'set') => {
  const data = await authenticatedFetch(`${API_URL}/inventory/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity, adjustment_type: adjustmentType }),
  });
  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const bulkUpdateStock = async (updates) => {
  return await authenticatedFetch(`${API_URL}/inventory/bulk-update`, {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
};

export const batchReceiveStock = async (items, notes) => {
  return await authenticatedFetch(`${API_URL}/inventory/batch-receive`, {
    method: 'POST',
    body: JSON.stringify({ items, notes }),
  });
};

// ==================== REPORTS ====================

export const getSalesReport = async (range = 'daily', startDate, endDate) => {
  if (USE_SUPABASE) {
    let query = supabase.from('orders').select('*').in('status', ['paid', 'completed']);
    const now = new Date();
    if (range === 'daily') {
      query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
    } else if (range === 'weekly' || range === '7d') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      query = query.gte('created_at', d.toISOString());
    } else if (range === 'monthly' || range === '30d') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      query = query.gte('created_at', d.toISOString());
    } else if (range === '90d') {
      const d = new Date(); d.setDate(d.getDate() - 90);
      query = query.gte('created_at', d.toISOString());
    } else if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const orders = data || [];
    const onlineOrders = orders.filter(o => o.source === 'online');
    const posOrders = orders.filter(o => o.source === 'pos');
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return {
      range,
      total_orders: orders.length,
      total_revenue: totalRevenue,
      average_order_value: orders.length ? totalRevenue / orders.length : 0,
      total_discounts: orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0),
      online_orders: onlineOrders.length,
      pos_orders: posOrders.length,
      online_revenue: onlineOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      pos_revenue: posOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    };
  }
  const params = new URLSearchParams({ range });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales?${params}`);
};

export const getSalesByChannel = async (startDate, endDate) => {
  if (USE_SUPABASE) {
    let query = supabase.from('orders').select('source, total_amount').in('status', ['paid', 'completed']);
    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const channels = {};
    (data || []).forEach(o => {
      const ch = o.source || 'unknown';
      if (!channels[ch]) channels[ch] = { channel: ch, order_count: 0, total_revenue: 0 };
      channels[ch].order_count++;
      channels[ch].total_revenue += Number(o.total_amount || 0);
    });
    return Object.values(channels).map(c => ({
      ...c,
      avg_order_value: c.order_count ? c.total_revenue / c.order_count : 0,
    }));
  }
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales-by-channel?${params}`);
};

export const getStockLevelsReport = async () => {
  if (USE_SUPABASE) {
    const { data: products, error } = await supabase.from('products').select('*, categories(name)');
    if (error) throw new Error(error.message);
    const prods = products || [];
    const overview = {
      total_products: prods.length,
      total_stock: prods.reduce((s, p) => s + (p.stock_quantity || 0), 0),
      out_of_stock_count: prods.filter(p => (p.stock_quantity || 0) === 0).length,
      low_stock_count: prods.filter(p => p.stock_quantity > 0 && p.stock_quantity <= (p.low_stock_threshold || 5)).length,
      in_stock_count: prods.filter(p => p.stock_quantity > (p.low_stock_threshold || 5)).length,
      total_inventory_value: prods.reduce((s, p) => s + (p.stock_quantity || 0) * Number(p.buying_price || 0), 0),
      potential_revenue: prods.reduce((s, p) => s + (p.stock_quantity || 0) * Number(p.price || 0), 0),
    };
    const catMap = {};
    prods.forEach(p => {
      const cat = p.categories?.name || 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = { category: cat, product_count: 0, total_stock: 0, low_stock_items: 0 };
      catMap[cat].product_count++;
      catMap[cat].total_stock += p.stock_quantity || 0;
      if (p.stock_quantity <= (p.low_stock_threshold || 5)) catMap[cat].low_stock_items++;
    });
    return { overview, by_category: Object.values(catMap).sort((a, b) => b.total_stock - a.total_stock) };
  }
  return await authenticatedFetch(`${API_URL}/reports/stock-levels`);
};

export const getTopProducts = async (limit = 10, startDate, endDate) => {
  if (USE_SUPABASE) {
    let query = supabase.from('orders').select('id, created_at, status, order_items(quantity, product_price, product_id, products(id, name, part_number, image, price, stock_quantity, categories(name)))').in('status', ['paid', 'completed']);
    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const productMap = {};
    (data || []).forEach(order => {
      (order.order_items || []).forEach(item => {
        const pid = item.product_id;
        if (!productMap[pid]) {
          productMap[pid] = {
            id: pid, name: item.products?.name || 'Unknown', part_number: item.products?.part_number,
            image: item.products?.image, price: Number(item.products?.price || 0),
            stock_quantity: item.products?.stock_quantity || 0,
            category_name: item.products?.categories?.name || null,
            order_count: 0, total_sold: 0, total_revenue: 0, _orders: new Set(),
          };
        }
        productMap[pid]._orders.add(order.id);
        productMap[pid].total_sold += item.quantity || 0;
        productMap[pid].total_revenue += (Number(item.product_price || 0)) * (item.quantity || 0);
      });
    });
    return Object.values(productMap)
      .map(p => ({ ...p, order_count: p._orders.size, _orders: undefined }))
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, limit);
  }
  const params = new URLSearchParams({ limit: limit.toString() });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/top-products?${params}`);
};

export const getDailySalesTrend = async (days = 30) => {
  if (USE_SUPABASE) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase.from('orders').select('created_at, total_amount, source').in('status', ['paid', 'completed']).gte('created_at', since.toISOString());
    if (error) throw new Error(error.message);
    const dayMap = {};
    (data || []).forEach(o => {
      const date = o.created_at?.split('T')[0];
      if (!date) return;
      if (!dayMap[date]) dayMap[date] = { date, order_count: 0, revenue: 0, online_orders: 0, pos_orders: 0 };
      dayMap[date].order_count++;
      dayMap[date].revenue += Number(o.total_amount || 0);
      if (o.source === 'online') dayMap[date].online_orders++;
      if (o.source === 'pos') dayMap[date].pos_orders++;
    });
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  }
  return await authenticatedFetch(`${API_URL}/reports/daily-trend?days=${days}`);
};

export const getProfitReport = async (startDate, endDate) => {
  if (USE_SUPABASE) {
    let query = supabase.from('orders').select('total_amount, discount_amount, order_items(quantity, product_price, products(buying_price))').in('status', ['paid', 'completed']);
    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const orders = data || [];
    let totalRevenue = 0, totalCost = 0, totalDiscounts = 0;
    orders.forEach(o => {
      totalRevenue += Number(o.total_amount || 0);
      totalDiscounts += Number(o.discount_amount || 0);
      (o.order_items || []).forEach(item => {
        totalCost += (item.quantity || 0) * Number(item.products?.buying_price || 0);
      });
    });
    const profit = totalRevenue - totalCost;
    return {
      total_orders: orders.length,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      gross_profit: profit,
      profit_margin: totalRevenue > 0 ? parseFloat(((profit / totalRevenue) * 100).toFixed(2)) : 0,
      total_discounts: totalDiscounts,
      net_profit: profit - totalDiscounts,
    };
  }
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/profit?${params}`);
};

// ==================== SUPER ADMIN ====================

// User Management
export const adminGetAllUsers = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('users').select('id, name, email, role, phone, is_active, login_attempts, locked_until, two_factor_enabled, last_login, created_at', { count: 'exact' });
    if (params.role) query = query.eq('role', params.role);
    if (params.status === 'active') query = query.eq('is_active', true).is('locked_until', null);
    if (params.status === 'inactive') query = query.eq('is_active', false);
    if (params.status === 'locked') query = query.not('locked_until', 'is', null).gt('locked_until', new Date().toISOString());
    if (params.search) query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
    const page = params.page || 1;
    const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
    if (error) throw new Error(error.message);
    return { users: data || [], total: count || 0 };
  }
  const qs = new URLSearchParams();
  if (params.role) qs.append('role', params.role);
  if (params.status) qs.append('status', params.status);
  if (params.search) qs.append('search', params.search);
  if (params.page) qs.append('page', params.page);
  return authenticatedFetch(`${API_URL}/admin/users?${qs.toString()}`);
};

export const adminLockUser = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users')
      .update({ is_active: false, locked_until: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await supabase.from('sessions').update({ is_active: false }).eq('user_id', id);
    await logSupabaseActivity('admin.lock_user', 'user', id);
    return { message: 'User locked' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/lock`, { method: 'PATCH' });
};

export const adminUnlockUser = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users')
      .update({ is_active: true, locked_until: null, login_attempts: 0 })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('admin.unlock_user', 'user', id);
    return { message: 'User unlocked' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/unlock`, { method: 'PATCH' });
};

export const adminResetUserPassword = async (id, newPassword) => {
  if (USE_SUPABASE) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase.from('users').update({ password: hashedPassword }).eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('admin.reset_password', 'user', id);
    return { message: 'Password reset successfully' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/reset-password`, {
    method: 'POST', body: JSON.stringify({ newPassword }),
  });
};

export const adminUpdateUserRole = async (id, role) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users').update({ role }).eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('admin.update_role', 'user', id, { role });
    return { message: 'Role updated' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/role`, {
    method: 'PATCH', body: JSON.stringify({ role }),
  });
};

export const adminDeleteUser = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('sessions').update({ is_active: false }).eq('user_id', id);
    try { await supabase.from('user_permissions').delete().eq('user_id', id); } catch {}
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await logSupabaseActivity('admin.delete_user', 'user', id);
    return { message: 'User deleted' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
};

// System Settings
export const getSystemSettings = async (category) => {
  if (USE_SUPABASE) {
    let query = supabase.from('system_settings').select('*');
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }
  const url = category ? `${API_URL}/admin/settings/${category}` : `${API_URL}/admin/settings`;
  return authenticatedFetch(url);
};

export const updateSystemSettings = async (category, settings) => {
  if (USE_SUPABASE) {
    for (const [key, value] of Object.entries(settings)) {
      const { error } = await supabase.from('system_settings')
        .upsert({ category, key, value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'category,key' });
      if (error) throw new Error(error.message);
    }
    await logSupabaseActivity('settings.update', 'system_settings', null, { category });
    return { message: 'Settings saved' };
  }
  return authenticatedFetch(`${API_URL}/admin/settings`, {
    method: 'PUT', body: JSON.stringify({ category, settings }),
  });
};

// Security Settings
export const getSecuritySettings = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('system_settings').select('key, value').eq('category', 'security');
    if (error) throw new Error(error.message);
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    return settings;
  }
  return authenticatedFetch(`${API_URL}/admin/security/settings`);
};

export const updateSecuritySettings = async (settings) => {
  if (USE_SUPABASE) {
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('system_settings')
        .upsert({ category: 'security', key, value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'category,key' });
    }
    await logSupabaseActivity('settings.update_security', 'system_settings', null, { keys: Object.keys(settings) });
    return { message: 'Security settings updated' };
  }
  return authenticatedFetch(`${API_URL}/admin/security/settings`, {
    method: 'PUT', body: JSON.stringify({ settings }),
  });
};

// Login Attempts
export const getLoginAttempts = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('login_attempts').select('*').order('created_at', { ascending: false });
    if (params.email) query = query.ilike('email', `%${params.email}%`);
    if (params.success !== undefined) query = query.eq('success', params.success);
    const { data } = await query.limit(params.limit || 100);
    // Get summary stats
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { count: todayTotal } = await supabase.from('login_attempts').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo);
    const { count: todayFailed } = await supabase.from('login_attempts').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo).eq('success', false);
    const { count: lockedCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).not('locked_until', 'is', null).gt('locked_until', now.toISOString());
    return {
      attempts: data || [],
      stats: { today_total: todayTotal || 0, today_failed: todayFailed || 0, locked_accounts: lockedCount || 0 }
    };
  }
  const qs = new URLSearchParams();
  if (params.email) qs.append('email', params.email);
  if (params.success !== undefined) qs.append('success', String(params.success));
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/security/login-attempts?${qs.toString()}`);
};

// Error & Transaction Logs
export const getErrorLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('error_logs').select('*').order('created_at', { ascending: false });
    if (params.type) query = query.eq('error_type', params.type);
    const { data } = await query.limit(params.limit || 100);
    return data || [];
  }
  const qs = new URLSearchParams();
  if (params.type) qs.append('type', params.type);
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/logs/errors?${qs.toString()}`);
};

export const getTransactionLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('activity_logs').select('*, users!activity_logs_user_id_fkey(name)')
      .or('action.ilike.order%,action.ilike.payment%,action.ilike.checkout%,action.ilike.refund%,action.ilike.pos%')
      .order('created_at', { ascending: false }).limit(params.limit || 100);
    return (data || []).map(d => ({ ...d, user_name: d.users?.name }));
  }
  const qs = new URLSearchParams();
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/logs/transactions?${qs.toString()}`);
};

export const getSuspiciousActivity = async () => {
  if (USE_SUPABASE) {
    const { data: locked } = await supabase.from('users')
      .select('id, name, email, login_attempts, locked_until, last_login')
      .not('locked_until', 'is', null).gt('locked_until', new Date().toISOString());
    return { failed_login_clusters: [], locked_accounts: locked || [], bulk_operations: [] };
  }
  return authenticatedFetch(`${API_URL}/admin/logs/suspicious`);
};

// Backup & Recovery
export const createBackup = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('backup_history')
      .insert({ backup_type: 'manual', status: 'completed', file_name: `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json` })
      .select().single();
    if (error) throw new Error(error.message);
    await logSupabaseActivity('backup.create', 'backup', data.id);
    return { message: 'Backup created', backup: data };
  }
  return authenticatedFetch(`${API_URL}/admin/backup`, { method: 'POST' });
};

export const getBackupHistory = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('backup_history').select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/admin/backup/history`);
};

export const resendVerificationEmail = async (email) => {
  return await authenticatedFetch(`${API_URL}/auth/resend-verification`, {
    method: 'POST',
    body: JSON.stringify({ email })
  });
};

export const verifyEmailToken = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
    const tokenError = new Error('This verification link is invalid.');
    tokenError.code = 'VERIFICATION_TOKEN_INVALID';
    throw tokenError;
  }

  let data;
  try {
    data = await authenticatedFetch(`${API_URL}/auth/verify-email`, {
      method: 'POST',
      body: JSON.stringify({ token: normalizedToken }),
      timeoutMs: 8000,
      skipCsrf: true,
    });
  } catch (error) {
    const code = String(error?.code || '').toUpperCase();

    if (code === 'REQUEST_TIMEOUT') {
      const timeoutError = new Error('Verification is taking longer than expected. Please try again.');
      timeoutError.code = 'VERIFICATION_TIMEOUT';
      throw timeoutError;
    }

    if (code === 'NETWORK_ERROR') {
      const networkError = new Error('Unable to reach the server. Check your connection and try again.');
      networkError.code = 'VERIFICATION_NETWORK_ERROR';
      throw networkError;
    }

    throw error;
  }

  if (USE_SUPABASE && data && data.user) {
    const sbToken = 'sb-token-' + btoa(JSON.stringify({ id: data.user.id, email: data.user.email, role: data.user.role }));
    return { ...data, token: sbToken };
  }
  return data;
};

export const confirmEmailChangeToken = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
    const tokenError = new Error('This email change link is invalid.');
    tokenError.code = 'EMAIL_CHANGE_TOKEN_INVALID';
    throw tokenError;
  }

  return authenticatedFetch(`${API_URL}/users/profile/email-change/confirm`, {
    method: 'POST',
    body: JSON.stringify({ token: normalizedToken }),
  });
};

