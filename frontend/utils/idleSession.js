export const IDLE_WARNING_MS = 60000;

export const serverSessionDeadline = (response, requestStarted = Date.now()) => {
  const remaining = Date.parse(response.expires_at) - Date.parse(response.server_now);
  if (!Number.isFinite(remaining)) throw new Error('Session expiry was not provided by the server.');
  return requestStarted + Math.max(0, remaining);
};

export const createIdleSessionController = ({ onWarning = () => {}, onWarningCleared = () => {}, onLogout = () => {},
  onActivity = () => {}, onStay = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) => {
  let deadline = null, running = false, warning = false, loggedOut = false;
  let warningTimer, logoutTimer;
  const clear = () => { clearTimer(warningTimer); clearTimer(logoutTimer); };
  const logout = () => { if (!running || loggedOut) return false; loggedOut = true; running = false; clear(); void onLogout(); return true; };
  const check = () => {
    if (!running || deadline == null) return;
    if (now() >= deadline) { logout(); return; }
    if (deadline - now() <= IDLE_WARNING_MS && !warning) { warning = true; onWarning({ logoutAt: deadline }); }
  };
  return {
    start() { if (running) return false; running = true; return true; },
    setDeadline(value) {
      if (!running || !Number.isFinite(value)) return;
      deadline = value; clear(); warning = false;
      if (value - now() > IDLE_WARNING_MS) onWarningCleared();
      check();
      if (!running) return;
      warningTimer = setTimer(check, Math.max(0, value - now() - IDLE_WARNING_MS));
      logoutTimer = setTimer(logout, Math.max(0, value - now()));
    },
    check,
    recordActivity() { if (!running || warning || loggedOut) return false; void onActivity(); return true; },
    staySignedIn() { if (!running || loggedOut) return false; void onStay(); return true; },
    logoutNow: logout,
    stop() { const wasRunning = running; running = false; clear(); onWarningCleared(); return wasRunning; },
  };
};
