import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, RefreshCw, Trash2 } from 'lucide-react';
import { createDatabaseBackup, deleteDatabaseBackup, downloadDatabaseBackup, getDatabaseBackups, getDatabaseBackupStatus } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import BrandButton from '../../components/ui/BrandButton';
import { ConfirmationDialog } from '../../components/ui/BrandPrimitives';

const timestamp = (value, timezone) => value ? new Date(value).toLocaleString('en-PH', timezone ? { timeZone: timezone } : undefined) : 'Never';
const size = value => value == null ? '-' : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
const duration = row => row.started_at && row.completed_at ? `${Math.max(0, Math.round((new Date(row.completed_at) - new Date(row.started_at)) / 1000))}s` : '-';

export default function BackupRecoveryView() {
  const [backups, setBackups] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const inFlight = useRef(false);
  const previousActive = useRef(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [history, state] = await Promise.all([getDatabaseBackups(), getDatabaseBackupStatus()]);
      setBackups(history);
      setStatus(state);
      if (previousActive.current && !state.active) {
        const finished = history.find(row => row.id === previousActive.current);
        if (finished?.status === 'completed') setNotice('Backup completed successfully.');
        if (finished?.status === 'failed') setError(finished.error_summary || 'Backup failed. Check system logs.');
      }
      previousActive.current = state.active?.id || null;
    } catch (failure) { setError(failure.message || 'Backup status could not be loaded.'); }
    finally { setLoading(false); inFlight.current = false; }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer); }, [load]);
  const act = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (confirm === 'create') {
        const result = await createDatabaseBackup();
        previousActive.current = result.backup.id;
        setStatus(current => ({ ...current, active: result.backup }));
        setNotice('Preparing backup...');
      } else { await deleteDatabaseBackup(confirm.id); setNotice('Backup deleted.'); }
      setConfirm(null);
      await load();
    } catch (failure) { setConfirm(null); setError(failure.message || 'Backup operation failed.'); }
    finally { setBusy(false); }
  };
  const download = async row => {
    setError('');
    try {
      const result = await downloadDatabaseBackup(row.id);
      const anchor = document.createElement('a');
      anchor.href = result.url; anchor.download = result.filename; anchor.rel = 'noreferrer';
      anchor.referrerPolicy = 'no-referrer'; anchor.click();
    } catch (failure) { setError(failure.message || 'Backup download failed.'); }
  };
  const active = Boolean(status?.active);
  const newest = status?.last_success?.id;
  return <div className="space-y-5">
    <PageHeader title="Backup & recovery" description="Encrypted PostgreSQL snapshots in private durable storage." actions={<BrandButton disabled={loading || busy || active || !status?.configured} onClick={() => setConfirm('create')}><Database size={16} aria-hidden="true" />{active ? 'Backup in progress' : 'Create backup'}</BrandButton>} />
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {status?.readiness_error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{status.readiness_error}</p>}
    {status?.automatic_enabled && status.scheduler_status !== 'healthy' && <p role="status" className="text-sm text-amber-900">Automatic scheduler {status.scheduler_status === 'failed' ? 'reported a failed automatic backup' : status.scheduler_status === 'overdue' ? 'is overdue' : 'has not been observed'}. Check the latest backup result and external daily schedule; the web page does not run scheduled backups.</p>}
    <dl className="sa-backup-summary">
      <div><dt>Last successful backup</dt><dd>{status ? timestamp(status.last_success?.completed_at) : 'Unavailable'}</dd></div>
      <div><dt>Next automatic backup</dt><dd>{status?.next_automatic_backup ? `${timestamp(status.next_automatic_backup, status.timezone)} (${status.timezone})` : status ? 'Disabled' : 'Unavailable'}</dd></div>
      <div><dt>Automatic backups</dt><dd>{status ? status.automatic_enabled ? 'Enabled' : 'Disabled' : 'Loading...'}</dd></div>
      <div><dt>Retention / storage</dt><dd>{status ? `${status.retention_days} days / ${status.storage === 'private' ? 'Private - AES-256-GCM' : 'Unavailable'}` : 'Loading...'}</dd></div>
    </dl>
    {status?.last_failure && <p className="text-sm text-slate-700">Last failed backup: {timestamp(status.last_failure.completed_at)}. {status.last_failure.error_summary}</p>}
    <div className="flex justify-end"><BrandButton variant="secondary" onClick={() => { setError(''); load(); }}><RefreshCw size={16} aria-hidden="true" />Refresh history</BrandButton></div>
    {loading ? <p role="status">Loading backup history...</p> : <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white" role="region" aria-label="Backup history" tabIndex={0}>
      <table className="sa-backup-table">
        <caption>Backup history <span className="text-xs font-normal text-slate-600">Latest 100 records</span></caption>
        <thead><tr>{['Created', 'Type', 'Status', 'Size', 'Duration', 'Created by', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{backups.length === 0 ? <tr><td colSpan={7}>No database backups yet.</td></tr> : backups.map(row => <tr key={row.id}>
          <td className="min-w-40">{timestamp(row.created_at)}{row.checksum && <code title="SHA-256 of encrypted backup">SHA-256: {row.checksum}</code>}</td>
          <td>{row.backup_type === 'automatic' ? 'Automatic' : 'Manual'}</td>
          <td><span className="capitalize">{row.deleted_at ? 'Deleted' : row.status}</span>{row.error_summary && <p className="mt-1 min-w-40 text-xs text-red-700">{row.error_summary}</p>}</td>
          <td className="whitespace-nowrap">{size(row.size_bytes)}</td><td>{duration(row)}</td><td>{row.created_by_name}</td>
          <td><div className="flex gap-2">{row.status === 'completed' && !row.deleted_at && <BrandButton variant="secondary" onClick={() => download(row)} aria-label={`Download backup from ${timestamp(row.created_at)}`}><Download size={16} aria-hidden="true" />Download</BrandButton>}{!row.deleted_at && !['queued','running'].includes(row.status) && <BrandButton variant="secondary" disabled={active || row.id === newest} title={row.id === newest ? 'The newest successful backup is protected' : undefined} onClick={() => setConfirm(row)} aria-label={`Delete backup from ${timestamp(row.created_at)}`}><Trash2 size={16} aria-hidden="true" />Delete</BrandButton>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <section className="border-t border-slate-200 pt-5"><h2 className="text-lg font-semibold">Recovery</h2><p className="mt-2 text-sm leading-6 text-slate-600">Backups can currently be downloaded for controlled database recovery. In-application restoration is disabled to protect production data.</p><p className="mt-2 text-sm leading-6 text-slate-600">Downloads are encrypted. An authorized operator must use the separately stored backup encryption key and the backup:decrypt command before restoring to an isolated PostgreSQL database.</p></section>
    <ConfirmationDialog isOpen={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }} onConfirm={act} busy={busy} title={confirm === 'create' ? 'Create database backup?' : 'Delete database backup?'} description={confirm === 'create' ? 'This creates an encrypted, private snapshot of the current application database.' : 'This permanently deletes the encrypted backup from private storage. The newest successful backup is protected.'} confirmLabel={confirm === 'create' ? 'Create backup' : 'Delete backup'} danger={confirm !== 'create'} />
  </div>;
}
