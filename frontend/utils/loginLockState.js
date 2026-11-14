export const LOGIN_LOCK_STORAGE_KEY = '10thwest:login-lock';
const hashPattern = /^[a-f0-9]{64}$/;
const sessionStore = () => {
  try { return globalThis.sessionStorage; } catch { return null; }
};

export const loginIdentifier = async (email, cryptoApi = globalThis.crypto) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '';
  try {
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Storage is optional UX. If Web Crypto is unavailable, match in memory only.
    return `memory:${normalized}`;
  }
};

export const clearLoginLock = (storage = sessionStore()) => {
  try { storage?.removeItem(LOGIN_LOCK_STORAGE_KEY); } catch { /* Storage can be denied by the browser. */ }
};

const validTemporaryLock = (lock, now) => lock && hashPattern.test(lock.identifier)
  && lock.recovery === false && Number.isFinite(lock.deadline)
  && Number.isFinite(new Date(lock.deadline).getTime()) && lock.deadline > now;

export const readLoginLock = (storage = sessionStore(), now = Date.now()) => {
  try {
    const lock = JSON.parse(storage?.getItem(LOGIN_LOCK_STORAGE_KEY) || 'null');
    if (validTemporaryLock(lock, now)) return { identifier: lock.identifier, deadline: lock.deadline, recovery: false };
  } catch { /* Discard malformed or inaccessible metadata. */ }
  clearLoginLock(storage);
  return null;
};

export const saveLoginLock = (lock, storage = sessionStore(), now = Date.now()) => {
  if (!validTemporaryLock(lock, now)) { clearLoginLock(storage); return; }
  try {
    // Explicit allowlist: never persist an email, credentials or a response body.
    storage?.setItem(LOGIN_LOCK_STORAGE_KEY, JSON.stringify({ identifier: lock.identifier, deadline: lock.deadline, recovery: false }));
  } catch { /* The in-memory countdown remains usable without storage. */ }
  // Recovery-required warnings stay in memory: persisting an untimed client lock
  // could block sign-in after an administrator unlocks the account elsewhere.
};
