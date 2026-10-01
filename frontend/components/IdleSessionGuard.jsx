import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  createIdleSessionController,
  IDLE_LOGOUT_MS,
  IDLE_WARNING_MS,
} from '../utils/idleSession.js';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
const IDLE_LOGOUT_MESSAGE = 'You were signed out due to inactivity.';

const IdleSessionGuard = ({
  user,
  onLogout,
  warningMs = IDLE_WARNING_MS,
  logoutMs = IDLE_LOGOUT_MS,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const controllerRef = useRef(null);
  const stayButtonRef = useRef(null);
  const logoutInFlightRef = useRef(false);
  const [warning, setWarning] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const completeIdleLogout = useCallback(async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    setWarning(null);
    try {
      await onLogout?.();
    } finally {
      navigate(`/login?message=${encodeURIComponent(IDLE_LOGOUT_MESSAGE)}`, { replace: true });
      logoutInFlightRef.current = false;
    }
  }, [navigate, onLogout]);

  useEffect(() => {
    if (!user?.id) {
      setWarning(null);
      return undefined;
    }

    const controller = createIdleSessionController({
      warningMs,
      logoutMs,
      onWarning: ({ logoutAt }) => setWarning({ logoutAt }),
      onWarningCleared: () => setWarning(null),
      onLogout: completeIdleLogout,
    });
    controllerRef.current = controller;
    controller.start();

    let lastMouseMoveAt = 0;
    const recordActivity = (event) => {
      const currentTime = Date.now();
      if (event.type === 'mousemove' && currentTime - lastMouseMoveAt < 1000) return;
      if (event.type === 'mousemove') lastMouseMoveAt = currentTime;
      controller.recordActivity();
    };

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    return () => {
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
    };
  }, [completeIdleLogout, logoutMs, user?.id, warningMs]);

  useEffect(() => {
    controllerRef.current?.recordActivity();
  }, [location.key]);

  useEffect(() => {
    if (!warning?.logoutAt) return undefined;
    const updateCountdown = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((warning.logoutAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    const focusFrame = window.requestAnimationFrame(() => stayButtonRef.current?.focus());
    return () => {
      window.clearInterval(interval);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [warning]);

  if (!user?.id || !warning) return null;

  const handleStaySignedIn = () => {
    controllerRef.current?.staySignedIn();
  };

  return (
    <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="idle-warning-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Clock3 size={22} /></div>
          <div>
            <h2 id="idle-warning-title" className="text-lg font-bold text-slate-950">Session expiring soon</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">You have been inactive. You will be logged out soon.</p>
            <p className="mt-2 text-sm font-semibold text-amber-800" aria-live="polite">
              Signing out in {secondsRemaining} second{secondsRemaining === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => controllerRef.current?.logoutNow()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <LogOut size={16} /> Log out now
          </button>
          <button ref={stayButtonRef} type="button" onClick={handleStaySignedIn} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
};

export default IdleSessionGuard;
