import React, { useEffect, useRef, useState } from 'react';
import Modal from '../owner/Modal';
import BrandButton from '../ui/BrandButton';
import { uploadRecoveryBackup } from '../../services/api';

const size = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function EmergencyRecoveryDialog({ maximum, onContinue, onClose, onBusy }) {
  const [file, setFile] = useState(null);
  const [backup, setBackup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => { controller.current?.abort(); onBusy(false); }, [onBusy]);
  const select = event => {
    const selected = event.target.files?.[0]; setError(''); setFile(null);
    if (!selected) return;
    if (!/\.dump\.enc$/i.test(selected.name) || selected.size === 0) { setError('Select a non-empty encrypted backup file ending in .dump.enc.'); return; }
    if (selected.size > maximum) { setError(`Choose a backup smaller than ${size(maximum)}.`); return; }
    setFile(selected);
  };
  const upload = async () => {
    if (!file || busy) return;
    setBusy(true); onBusy(true); setError(''); controller.current = new AbortController();
    try { const result = await uploadRecoveryBackup(file, controller.current.signal); setBackup(result.backup); }
    catch (failure) { if (!controller.current.signal.aborted) setError(failure.message || 'We could not check this backup. Please try again.'); }
    finally { setBusy(false); onBusy(false); }
  };
  const close = () => { controller.current?.abort(); onClose(); };
  return <Modal isOpen onClose={close} title={backup ? 'Backup ready for recovery' : 'Restore downloaded backup'} size="xl" tone="danger">
    <div className="min-w-0 space-y-4 text-sm leading-6">
      {backup ? <>
        <dl className="space-y-3"><div><dt className="font-semibold">File</dt><dd className="break-all">{backup.filename}</dd></div><div><dt className="font-semibold">Size</dt><dd>{size(Number(backup.size_bytes))}</dd></div><div><dt className="font-semibold">Encrypted backup</dt><dd>Format verified</dd></div></dl>
        <p>The file format has been checked. The backup’s contents will be checked before any database information is replaced.</p>
        <p>Continuing opens the final confirmation. You will need your password and, if enabled, your authenticator code.</p>
      </> : <>
        <p className="font-semibold">Step 1 — Select backup file</p>
        <p>Choose an encrypted backup saved on your computer, USB drive or secure storage.</p>
        <label className="block font-semibold">Backup file<input type="file" accept=".dump.enc" disabled={busy} onChange={select} className="mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
        <p className="text-slate-600">Encrypted .dump.enc files only. Maximum size: {size(maximum)}.</p>
        {file && <dl><div><dt className="font-semibold">Selected file</dt><dd className="break-all">{file.name}</dd></div><div><dt className="font-semibold">Size</dt><dd>{size(file.size)}</dd></div></dl>}
        {busy && <p role="status" aria-live="polite">Uploading and checking backup file…</p>}
      </>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3"><BrandButton variant="secondary" onClick={close}>Cancel</BrandButton>{backup ? <BrandButton onClick={() => onContinue(backup)}>Continue to restore</BrandButton> : <BrandButton disabled={!file || busy} onClick={upload}>{busy ? 'Checking file…' : 'Upload and check file'}</BrandButton>}</div>
    </div>
  </Modal>;
}
