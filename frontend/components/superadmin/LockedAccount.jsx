import React, { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import useCountdown from '../../hooks/useCountdown.js';

export default function LockedAccount({ account, threshold, serverOffset, onExpire, onUnlock, busy }) {
  const deadline = account.recovery_required ? null : new Date(account.locked_until).getTime() - serverOffset;
  const { seconds, formatted } = useCountdown(deadline);
  const refreshed = useRef(false);
  useEffect(() => {
    if (deadline && seconds === 0 && !refreshed.current) {
      refreshed.current = true;
      onExpire();
    }
  }, [deadline, seconds, onExpire]);
  return <article className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold capitalize"><Lock size={16} aria-hidden="true" />{account.category}</p>
        <p className="mt-1 break-all text-sm text-slate-600">{account.masked_email}</p></div>
      <span className="text-sm font-medium text-orange-800">{account.recovery_required ? 'Recovery required' : 'Temporary protection'}</span>
    </div>
    <p className="mt-3 text-sm">{account.login_attempts} / {threshold} failed attempts · Stage {account.lock_stage} of 3</p>
    {account.recovery_required ? <p className="mt-2 text-sm leading-6 text-slate-600">Repeated failed sign-in attempts were detected. Password reset or administrative unlock required.</p> : <>
      <p className="mt-2 text-sm" aria-live="polite" aria-atomic="true">Try again in <strong className="tabular-nums">{formatted}</strong></p>
      <p className="mt-1 text-xs text-slate-600">Locked until {new Date(account.locked_until).toLocaleString()}</p>
    </>}
    <button type="button" disabled={busy} onClick={() => onUnlock(account.id)} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Unlock account</button>
  </article>;
}
