import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestPhonePasswordReset, verifyPhonePasswordReset } from '../services/api.js';
import useCountdown from '../hooks/useCountdown.js';

export default function PhonePasswordRecovery() {
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [deadline, setDeadline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { seconds, formatted } = useCountdown(deadline);
  const navigate = useNavigate();
  const request = async () => {
    setBusy(true); setError('');
    try {
      const result = await requestPhonePasswordReset(phone);
      setChallenge(result.challenge_id); setCode('');
      setDeadline(Date.now() + result.resend_after * 1000);
    } catch { setError('Unable to request a code. Please wait before trying again.'); }
    finally { setBusy(false); }
  };
  const verify = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await verifyPhonePasswordReset(phone, challenge, code);
      // Keep the one-time grant out of URLs and persistent application storage.
      navigate('/reset-password', { state: { resetToken: result.reset_token } });
    } catch { setError('Invalid or expired code. Request a new code if needed.'); }
    finally { setBusy(false); }
  };
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
  return <div className="space-y-4">
    <p className="text-sm leading-6 text-slate-600">Use the Philippine mobile number already verified on your account.</p>
    {error && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}</p>}
    <form className="space-y-4" onSubmit={challenge ? verify : event => { event.preventDefault(); request(); }}>
      <div><label htmlFor="recovery-phone" className="text-sm font-medium text-slate-700">Phone number</label>
        <input id="recovery-phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} readOnly={Boolean(challenge)} value={phone} onChange={event => setPhone(event.target.value)} placeholder="09XXXXXXXXX" className={inputClass} /></div>
      {challenge && <>
        <p role="status" className="text-sm leading-6 text-slate-600">If an eligible account matches that phone number, a verification code will be sent. The code expires in 5 minutes.</p>
        <div><label htmlFor="recovery-code" className="text-sm font-medium text-slate-700">Verification code</label>
          <input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className={inputClass} /></div>
      </>}
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50">{busy ? 'Please wait…' : challenge ? 'Verify Code' : 'Send Reset Code'}</button>
    </form>
    {challenge && <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" disabled={busy || seconds > 0} onClick={request} className="min-h-11 font-medium text-orange-800 disabled:text-slate-500">{seconds > 0 ? `Resend in ${formatted}` : 'Resend code'}</button>
      <button type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError(''); }} className="min-h-11 text-slate-600">Change number</button>
    </div>}
  </div>;
}
