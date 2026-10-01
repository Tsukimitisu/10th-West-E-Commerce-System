const MINUTE_MS = 60 * 1000;

const parseMinutes = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const IDLE_WARNING_MS = parseMinutes(import.meta.env?.VITE_IDLE_WARNING_MINUTES, 25) * MINUTE_MS;
export const IDLE_LOGOUT_MS = Math.max(
  parseMinutes(import.meta.env?.VITE_IDLE_LOGOUT_MINUTES, 30) * MINUTE_MS,
  IDLE_WARNING_MS + MINUTE_MS
);

export const createIdleSessionController = ({
  warningMs = IDLE_WARNING_MS,
  logoutMs = IDLE_LOGOUT_MS,
  onWarning = () => {},
  onWarningCleared = () => {},
  onLogout = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
} = {}) => {
  if (!Number.isFinite(warningMs) || warningMs <= 0) throw new Error('warningMs must be positive');
  if (!Number.isFinite(logoutMs) || logoutMs <= warningMs) throw new Error('logoutMs must be greater than warningMs');

  let warningTimer = null;
  let logoutTimer = null;
  let running = false;
  let warningVisible = false;
  let logoutStarted = false;

  const clearScheduledTimers = () => {
    if (warningTimer != null) clearTimer(warningTimer);
    if (logoutTimer != null) clearTimer(logoutTimer);
    warningTimer = null;
    logoutTimer = null;
  };

  const triggerLogout = () => {
    if (!running || logoutStarted) return false;
    logoutStarted = true;
    running = false;
    clearScheduledTimers();
    void Promise.resolve(onLogout());
    return true;
  };

  const schedule = () => {
    clearScheduledTimers();
    warningVisible = false;
    logoutStarted = false;
    onWarningCleared();
    const logoutAt = now() + logoutMs;
    warningTimer = setTimer(() => {
      if (!running || logoutStarted) return;
      warningVisible = true;
      onWarning({ logoutAt });
    }, warningMs);
    logoutTimer = setTimer(triggerLogout, logoutMs);
  };

  return {
    start() {
      if (running) return false;
      running = true;
      schedule();
      return true;
    },
    recordActivity() {
      if (!running || warningVisible || logoutStarted) return false;
      schedule();
      return true;
    },
    staySignedIn() {
      if (!running || logoutStarted) return false;
      schedule();
      return true;
    },
    logoutNow: triggerLogout,
    stop() {
      const wasRunning = running;
      running = false;
      warningVisible = false;
      clearScheduledTimers();
      onWarningCleared();
      return wasRunning;
    },
  };
};
