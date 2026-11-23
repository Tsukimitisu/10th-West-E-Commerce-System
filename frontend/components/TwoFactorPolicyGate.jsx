import React, { useState } from 'react';
import { challenge2FA, getProfile, setup2FA, verify2FA } from '../services/api.js';

// Shared authentication step using the existing TOTP/recovery mechanisms.
export default function TwoFactorPolicyGate({ user, onLogin, onLogout }) {
  const [password, setPassword] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const enrolling = user.requires_2fa_enrollment;
  const finish = async () => onLogin(await getProfile(), '');
  const run = async action => {
    setError(''); setBusy(true);
    try { await action(); }
    catch (failure) { setError(failure.message || 'Unable to complete two-factor authentication.'); }
    finally { setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    void run(async () => {
      if (enrolling && !qrCode) {
        setQrCode((await setup2FA(password)).qrCode); setPassword('');
      } else if (enrolling) {
        setRecoveryCodes((await verify2FA(code)).recovery_codes || []);
      } else { await challenge2FA(code); await finish(); }
    });
  };
  const button = 'min-h-11 w-full rounded-lg bg-orange-600 px-4 font-semibold text-white focus-visible:outline-orange-600 disabled:opacity-50';
  const input = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus-visible:outline-orange-600';
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="two-factor-policy-title">
      <h1 id="two-factor-policy-title" className="text-2xl font-bold text-slate-950">{enrolling ? 'Set up two-factor authentication' : 'Verify your identity'}</h1>
      <p className="mt-2 text-sm text-slate-600">{enrolling ? 'System policy requires an authenticator before you can continue.' : 'Enter your authenticator code or an unused recovery code to continue.'}</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {recoveryCodes.length ? <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-700">Save these recovery codes securely. Each code can be used once.</p>
        <ul className="space-y-1 break-all font-mono text-sm">{recoveryCodes.map(value => <li key={value}>{value}</li>)}</ul>
        <button type="button" disabled={busy} onClick={() => void run(finish)} className={button}>I saved my codes — Continue</button>
      </div> : <form onSubmit={submit} className="mt-5 space-y-4">
        {enrolling && !qrCode ? <>
          {user.has_local_password && <label className="block text-sm font-medium text-slate-800">Current password<input autoFocus type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={input} /></label>}
          <button disabled={busy} className={button}>{busy ? 'Preparing…' : 'Set up authenticator'}</button>
        </> : <>
          {qrCode && <><p className="text-sm text-slate-700">Scan this QR code in your authenticator app.</p><img src={qrCode} alt="Authenticator setup QR code" className="mx-auto h-48 w-48" /></>}
          <label className="block text-sm font-medium text-slate-800">{enrolling ? 'Authenticator code' : 'Authenticator or recovery code'}<input autoFocus autoComplete="one-time-code" required value={code} onChange={event => setCode(event.target.value)} maxLength={enrolling ? 6 : 17} className={input} /></label>
          <button disabled={busy} className={button}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
        </>}
      </form>}
      <button type="button" onClick={onLogout} disabled={busy} className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 focus-visible:outline-orange-600">Sign out</button>
    </section>
  </main>;
}
