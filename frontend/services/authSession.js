const AUTH_CHANGED_EVENT = 'auth:changed';
const AUTH_REFRESH_EVENT = 'auth:refresh';
const LEGACY_AUTH_KEYS = ['shopCoreUser', 'shopCoreToken'];

let currentUser = null;
let authChannel = null;

const canUseWindow = () => typeof window !== 'undefined';

const getAuthChannel = () => {
  if (!canUseWindow() || typeof BroadcastChannel === 'undefined') return null;
  if (!authChannel) {
    authChannel = new BroadcastChannel('twm-auth');
    authChannel.onmessage = (event) => {
      if (event.data?.type === 'auth-refresh') {
        window.dispatchEvent(new Event(AUTH_REFRESH_EVENT));
      }
      if (event.data?.type === 'auth-cleared') {
        currentUser = null;
        window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { user: null } }));
      }
    };
  }
  return authChannel;
};

export const clearLegacyAuthStorage = () => {
  if (!canUseWindow()) return;
  for (const key of LEGACY_AUTH_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures; auth no longer depends on localStorage.
    }
  }
};

export const getCurrentAuthUser = () => currentUser;

export const setCurrentAuthUser = (user, { broadcast = true } = {}) => {
  currentUser = user || null;
  clearLegacyAuthStorage();

  if (canUseWindow()) {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { user: currentUser } }));
    if (broadcast) {
      getAuthChannel()?.postMessage({ type: 'auth-refresh', at: Date.now() });
    }
  }

  return currentUser;
};

export const clearCurrentAuthUser = ({ broadcast = true } = {}) => {
  currentUser = null;
  clearLegacyAuthStorage();

  if (canUseWindow()) {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { user: null } }));
    if (broadcast) {
      getAuthChannel()?.postMessage({ type: 'auth-cleared', at: Date.now() });
    }
  }
};

export const requestAuthRefresh = ({ broadcast = true } = {}) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new Event(AUTH_REFRESH_EVENT));
  if (broadcast) {
    getAuthChannel()?.postMessage({ type: 'auth-refresh', at: Date.now() });
  }
};

export const subscribeAuthChanges = (handler) => {
  if (!canUseWindow()) return () => {};
  const listener = (event) => handler(event.detail?.user ?? currentUser);
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
};

export const subscribeAuthRefresh = (handler) => {
  if (!canUseWindow()) return () => {};
  window.addEventListener(AUTH_REFRESH_EVENT, handler);
  getAuthChannel();
  return () => window.removeEventListener(AUTH_REFRESH_EVENT, handler);
};
