import React, { useCallback, useEffect, useState } from 'react';
import { getMaintenanceStatus } from '../../services/api.js';
import BrandMark from '../ui/BrandMark';
import BrandButton from '../ui/BrandButton';

export default function MaintenanceGate({ enabled, pathname, children }) {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const status = await getMaintenanceStatus();
      if (typeof status?.active === 'boolean') setState(status);
    } catch { /* A controlled maintenance failure is also received through the shared API event. */ }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const receive = event => setState(event.detail);
    window.addEventListener('store:maintenance', receive);
    void check();
    const timer = window.setInterval(check, 30000);
    return () => { window.clearInterval(timer); window.removeEventListener('store:maintenance', receive); };
  }, [enabled, pathname, check]);
  if (!enabled || !state?.active && !state?.unavailable) return children;
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
    <section className="w-full max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8" aria-labelledby="store-maintenance-title">
      <BrandMark compact link={false} className="justify-center" />
      <h1 id="store-maintenance-title" className="font-display text-3xl font-semibold text-slate-950">{state.unavailable ? 'The shop is temporarily unavailable' : 'We’ll be back shortly'}</h1>
      <p className="break-words text-sm leading-6 text-slate-700">{state.message || 'We are taking care of the shop website. Please try again shortly.'}</p>
      <p className="text-sm leading-6 text-slate-600">Please check again in a minute. If you have already paid, your payment will continue to be checked. There is no need to pay again.</p>
      <div role="status" aria-live="polite"><BrandButton disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Try again'}</BrandButton></div>
      <p className="text-sm text-slate-600">Shop team member? <BrandButton to="/login" variant="ghost">Sign in</BrandButton></p>
    </section>
  </main>;
}
