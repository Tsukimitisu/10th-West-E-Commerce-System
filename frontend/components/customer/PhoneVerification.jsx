import React, { useEffect, useRef, useState } from 'react';
import { getPhoneVerification, sendPhoneVerification, verifyPhoneCode } from '../../services/api';

export default function PhoneVerification({ savedPhone, currentPhone }) {
  const [state, setState] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const pending = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    let cancelled = false;
    revision.current += 1;
    setState(null);
    setCode('');
    setMessage('');
    setCooldown(0);
    getPhoneVerification().then((result) => { if (!cancelled) setState(result); })
      .catch(() => {
        if (!cancelled) {
          setState({ available: false, verified: false });
          setMessage('Phone verification could not be loaded.');
        }
      });
    return () => { cancelled = true; };
  }, [savedPhone]);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const act = async (verify) => {
    if (pending.current) return;
    pending.current = true;
    const requestRevision = revision.current;
    setBusy(true);
    setMessage('');
    try {
      const result = verify ? await verifyPhoneCode(code) : await sendPhoneVerification();
      if (requestRevision !== revision.current) return;
      setMessage(result.message);
      if (verify) { setState((value) => ({ ...value, verified: true })); setCode(''); }
      else setCooldown(result.resend_after);
    } catch (error) {
      if (requestRevision === revision.current) setMessage(error.message || 'Phone verification failed.');
    }
    finally { pending.current = false; setBusy(false); }
  };
  const unsaved = !savedPhone || currentPhone !== savedPhone;
  return <div className="mt-2 space-y-2 text-sm">
    <p role="status">{!state ? 'Checking phone verification...' : state.verified && !unsaved ? 'Phone verified' : state.available ? 'Phone not verified' : 'Verification unavailable'}</p>
    {state?.available && (!state.verified || unsaved) && <>
      {unsaved && <p className="text-gray-500">Save your phone number before verifying it.</p>}
      <button type="button" disabled={busy || unsaved || cooldown > 0} onClick={() => act(false)} className="rounded-lg border px-3 py-2 disabled:opacity-50">
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification code'}
      </button>
      <div className="flex gap-2">
        <input aria-label="SMS verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="min-w-0 rounded-lg border px-3 py-2" />
        <button type="button" disabled={busy || unsaved || code.length < 6} onClick={() => act(true)} className="rounded-lg bg-red-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Please wait...' : 'Verify'}</button>
      </div>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
