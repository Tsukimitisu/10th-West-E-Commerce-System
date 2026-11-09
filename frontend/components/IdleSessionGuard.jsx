import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createIdleSessionController, serverSessionDeadline } from '../utils/idleSession.js';
import useCountdown from '../hooks/useCountdown.js';
import { getSessionState, recordSessionActivity, refreshSession } from '../services/api.js';
import { clearCurrentAuthUser, publishSessionDeadline, subscribeSessionDeadline } from '../services/authSession.js';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
const IDLE_LOGOUT_MESSAGE = 'You were signed out due to inactivity.';

export default function IdleSessionGuard({ user, onLogout }) {
  const navigate = useNavigate();
  const controllerRef = useRef(null), stayButtonRef = useRef(null), logoutStarted = useRef(false);
  const [deadline, setDeadline] = useState(null), [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const { formatted } = useCountdown(deadline);
  const completeIdleLogout = useCallback(() => {
    if (logoutStarted.current) return;
    logoutStarted.current = true;
    clearCurrentAuthUser();
    navigate(`/login?message=${encodeURIComponent(IDLE_LOGOUT_MESSAGE)}`, { replace: true });
    void Promise.resolve(onLogout?.()).catch(() => {});
  }, [navigate, onLogout]);

  useEffect(() => {
    if (!user?.id) { setWarning(false); return; }
    let active = true, pending = null, staying = false, lastServerTime = 0, lastActivity = Date.now();
    const abort = new AbortController();
    logoutStarted.current = false;
    const apply = (value, observedAt, broadcast = false) => {
      if (!active || observedAt < lastServerTime) return;
      lastServerTime = observedAt;
      setDeadline(value); controllerRef.current?.setDeadline(value);
      if (broadcast) publishSessionDeadline(value, observedAt);
    };
    const request = (operation, broadcast = false) => {
      if (pending) return pending;
      const started = Date.now();
      pending = (async () => {
        try { const result = await operation({ signal: abort.signal }); apply(serverSessionDeadline(result, started), Date.parse(result.server_now), broadcast); if (active) setError(''); }
        catch (failure) {
          if (!active) return;
          // The existing auth handler opens the required MFA step; this is not
          // session expiry and must not turn that step into a forced logout.
          if (['TWO_FACTOR_REQUIRED', 'TWO_FACTOR_ENROLLMENT_REQUIRED'].includes(failure.code)) return;
          if ([401,403].includes(failure.status)) completeIdleLogout();
          else if (active) setError('Session timing could not be refreshed. Please try again.');
        } finally { pending = null; }
      })();
      return pending;
    };
    const controller = createIdleSessionController({
      onWarning: () => setWarning(true), onWarningCleared: () => setWarning(false), onLogout: completeIdleLogout,
      onActivity: () => { if (Date.now() - lastActivity < 30000 || pending) return; lastActivity = Date.now(); void request(recordSessionActivity, true); },
      onStay: async () => {
        if (staying) return; staying = true; setBusy(true);
        try { if (pending) await pending; if (active && !logoutStarted.current) await request(refreshSession, true); }
        finally { staying = false; if (active) setBusy(false); }
      },
    });
    controllerRef.current = controller; controller.start();
    void request(getSessionState);
    const recordActivity = event => { if (event.isTrusted) controller.recordActivity(); };
    const check = () => { controller.check(); if (!logoutStarted.current) void request(getSessionState); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const authChanged = event => { if (!event.detail?.user) navigate('/login', { replace: true }); };
    const unsubscribe = subscribeSessionDeadline(value => apply(value.deadline, value.observedAt));
    const poll = setInterval(check, 30000);
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, recordActivity, { passive: true }));
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', visible);
    window.addEventListener('auth:changed', authChanged);
    return () => {
      active = false; abort.abort(); controller.stop(); controllerRef.current = null; clearInterval(poll); unsubscribe();
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, recordActivity));
      window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', visible); window.removeEventListener('auth:changed', authChanged);
    };
  }, [user?.id, completeIdleLogout, navigate]);

  useEffect(() => { if (warning) stayButtonRef.current?.focus(); }, [warning]);
  if (!user?.id || !warning) return null;
  return <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="idle-warning-title">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Clock3 size={22} /></div>
        <div><h2 id="idle-warning-title" className="text-lg font-bold text-slate-950">Are you still there?</h2>
          <p className="mt-2 text-sm font-semibold text-slate-800" aria-live="polite" aria-atomic="true">Your session will expire in <span className="tabular-nums">{formatted}</span></p>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => controllerRef.current?.logoutNow()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><LogOut size={16} /> Sign out</button>
        <button ref={stayButtonRef} disabled={busy} type="button" onClick={() => controllerRef.current?.staySignedIn()} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{busy ? 'Refreshing…' : 'Stay signed in'}</button>
      </div>
    </div>
  </div>;
}
