import React, { useState } from 'react';
import Modal from '../owner/Modal';
import BrandButton from '../ui/BrandButton';

export default function RestoreDatabaseDialog({ backup, requiresTotp, busy, onConfirm, onClose }) {
  const [acknowledgement, setAcknowledgement] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const valid = acknowledgement && confirmation === 'RESTORE' && password.length > 0 && (!requiresTotp || /^\d{6}$/.test(totpCode));
  const submit = async event => {
    event.preventDefault();
    if (!valid || busy) return;
    setError('');
    try { await onConfirm({ acknowledgement, confirmation, password, totp_code: totpCode }); }
    catch (failure) { setError(failure.message || 'Restore request was not accepted.'); }
    finally { setPassword(''); setTotpCode(''); }
  };
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Restore database backup?" size="xl" tone="danger">
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <dl className="grid min-w-0 gap-2 text-sm">
        {backup.source === 'uploaded_recovery' ? <><div><dt className="font-semibold">Backup file</dt><dd className="break-all">{backup.filename}</dd></div><div><dt className="font-semibold">Uploaded on</dt><dd>{new Date(backup.created_at).toLocaleString()}</dd></div><div><dt className="font-semibold">Backup date</dt><dd>The original backup date has not been verified.</dd></div></> : <div><dt className="font-semibold">Backup</dt><dd>{new Date(backup.created_at).toLocaleString()}</dd></div>}
        <div><dt className="font-semibold">Size</dt><dd>{backup.size_bytes == null ? 'Unavailable' : Number(backup.size_bytes) < 1048576 ? `${(Number(backup.size_bytes) / 1024).toFixed(1)} KB` : `${(Number(backup.size_bytes) / 1048576).toFixed(2)} MB`}</dd></div>
        <div><dt className="font-semibold">Checksum (SHA-256)</dt><dd className="break-all font-mono">{backup.checksum?.slice(0, 16)}…</dd></div>
      </dl>
      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
        <p className="font-semibold">Restoring this backup replaces current database information with the information saved in this backup.</p>
        <p>Orders, users, inventory and other changes made after this backup may be lost.</p>
        <p>The system will create a fresh safety backup before continuing.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={acknowledgement} onChange={event => setAcknowledgement(event.target.checked)} disabled={busy} /><span>I understand that newer database changes may be replaced.</span></label>
      <label className="block text-sm font-semibold">Type RESTORE<input autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
      <label className="block text-sm font-semibold">Current Super Admin password<input type="password" autoComplete="current-password" maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-2" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
      {requiresTotp && <label className="block text-sm font-semibold">Current authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-2" value={totpCode} onChange={event => setTotpCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3">
        <BrandButton variant="secondary" disabled={busy} onClick={onClose}>Cancel</BrandButton>
        <BrandButton type="submit" variant="danger" disabled={!valid || busy}>{busy ? 'Verifying request…' : 'Restore database'}</BrandButton>
      </div>
    </form>
  </Modal>;
}
