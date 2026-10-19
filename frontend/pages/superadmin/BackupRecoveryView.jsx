import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { createDatabaseBackup, deleteDatabaseBackup, downloadDatabaseBackup, getDatabaseBackups, getDatabaseBackupStatus, requestDatabaseRestore, getDatabaseRestoreJob } from '../../services/api';
import RestoreDatabaseDialog from '../../components/superadmin/RestoreDatabaseDialog';
import PageHeader from '../../components/operations/PageHeader';
import BrandButton from '../../components/ui/BrandButton';
import { ConfirmationDialog } from '../../components/ui/BrandPrimitives';

const timestamp = (value, timezone) => value ? new Date(value).toLocaleString('en-PH', timezone ? { timeZone: timezone } : undefined) : 'Never';
const size = value => value == null ? '-' : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
const duration = row => row.started_at && row.completed_at ? `${Math.max(0, Math.round((new Date(row.completed_at) - new Date(row.started_at)) / 1000))}s` : '-';

const RESTORE_STORAGE = '10thwest.restore-job';
const activeRestore = job => job && ['queued', 'preparing', 'restoring', 'validating'].includes(job.status);
const restorePhase = job => ({ queued: 'Waiting for the recovery worker...', safety_backup: 'Preparing safety backup...', downloading: 'Downloading selected backup...', verifying: 'Verifying backup...', restoring: 'Restoring database...', migrating: 'Applying controlled migrations...', validating: 'Validating restored data...' }[job.phase] || 'Preparing recovery...');
const savedJob = () => { try { return sessionStorage.getItem(RESTORE_STORAGE); } catch { return null; } };
const saveJob = id => { try { if (id) sessionStorage.setItem(RESTORE_STORAGE, id); else sessionStorage.removeItem(RESTORE_STORAGE); } catch { /* optional refresh persistence */ } };

export default function BackupRecoveryView() {
  const [backups, setBackups] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [restoreBackup, setRestoreBackup] = useState(null);
  const [restoreJob, setRestoreJob] = useState(null);
  const restoreId = useRef(savedJob());
  const inFlight = useRef(false);
  const previousActive = useRef(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (restoreId.current) {
        try {
          const job = await getDatabaseRestoreJob(restoreId.current);
          setError('');
          setRestoreJob(job);
          if (activeRestore(job) || (job.status === 'failed' && job.destructive_started)) return;
          restoreId.current = null;
          saveJob(null);
          if (job.status === 'completed') return;
        } catch (failure) {
          setError(`${failure.message || 'Recovery monitoring is temporarily unavailable.'} If your session expired, sign in again to check recovery status.`);
          return;
        }
      }
      const [history, state] = await Promise.all([getDatabaseBackups(), getDatabaseBackupStatus()]);
      if (restoreId.current) return;
      setBackups(history);
      setStatus(state);
      if (state.restore_job) {
        setRestoreJob(state.restore_job);
        if (activeRestore(state.restore_job) || (state.restore_job.status === 'failed' && state.restore_job.destructive_started)) {
          setRestoreBackup(null);
          restoreId.current = state.restore_job.id;
          saveJob(state.restore_job.id);
        }
      }
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
  const restore = async data => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestDatabaseRestore(restoreBackup.id, data);
      restoreId.current = result.job.id; saveJob(result.job.id);
      setRestoreJob(result.job); setRestoreBackup(null);
    } finally { setBusy(false); }
  };
  const recoveryProtected = activeRestore(restoreJob) || (restoreJob?.status === 'failed' && restoreJob.destructive_started);
  const active = Boolean(status?.active || recoveryProtected);
  const newest = status?.last_success?.id;
  return <div className="space-y-5">
    <PageHeader title="Backup & recovery" description="Encrypted PostgreSQL snapshots in private durable storage." actions={<BrandButton disabled={loading || busy || active || !status?.configured} onClick={() => setConfirm('create')}><Database size={16} aria-hidden="true" />{recoveryProtected ? 'Recovery in progress' : status?.active ? 'Backup in progress' : 'Create backup'}</BrandButton>} />
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {restoreJob && <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-live="polite" aria-atomic="true">
      <h2 className="text-lg font-semibold">{restoreJob.status === 'completed' ? 'Database restored successfully' : restoreJob.status === 'failed' ? (restoreJob.destructive_started ? 'Database recovery requires attention' : 'Database restoration was stopped safely') : 'Database restoration'}</h2>
      {activeRestore(restoreJob) && <><p role="status">{restorePhase(restoreJob)}</p><p className="text-sm text-slate-600">Keep this page available for status updates. Other application activity is paused during recovery.</p></>}
      {restoreJob.status === 'completed' && <><p>Restored from: {timestamp(restoreJob.restored_from)}</p><p>A safety backup of the previous database state was created before restoration.</p><p className="text-sm">You may need to sign in again.</p><BrandButton onClick={() => window.location.reload()}>Refresh application</BrandButton></>}
      {restoreJob.status === 'failed' && <p>{restoreJob.destructive_started ? 'The system remains in maintenance mode. Use the pre-restore safety backup with an authorized recovery operator.' : 'Production database was not changed by restoration.'}</p>}
      {restoreJob.github_run_url && <a href={restoreJob.github_run_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">View recovery workflow</a>}
      {error && <a href="/#/login" className="block text-sm underline">Sign in again to check recovery status</a>}
    </section>}
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
          <td><div className="flex gap-2">{row.status === 'completed' && !row.deleted_at && <BrandButton variant="secondary" onClick={() => download(row)} aria-label={`Download backup from ${timestamp(row.created_at)}`}><Download size={16} aria-hidden="true" />Download</BrandButton>}{row.status === 'completed' && row.encrypted === true && !row.deleted_at && <BrandButton variant="danger" disabled={busy || active || !status?.restore_configured} onClick={() => setRestoreBackup(row)} aria-label={`Restore backup from ${timestamp(row.created_at)}`}><RotateCcw size={16} aria-hidden="true" />Restore</BrandButton>}{!row.deleted_at && !['queued','running'].includes(row.status) && <BrandButton variant="secondary" disabled={active || row.id === newest} title={row.id === newest ? 'The newest successful backup is protected' : undefined} onClick={() => setConfirm(row)} aria-label={`Delete backup from ${timestamp(row.created_at)}`}><Trash2 size={16} aria-hidden="true" />Delete</BrandButton>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <section className="border-t border-slate-200 pt-5"><h2 className="text-lg font-semibold">Recovery</h2><p className="mt-2 text-sm leading-6 text-slate-600">Restoration runs through the guarded GitHub Actions recovery worker. It creates a fresh encrypted safety backup before replacing application data. Downloaded backups remain encrypted for controlled recovery.</p>{status && !status.restore_configured && <p className="mt-2 text-sm text-amber-900">Restore dispatch must be configured by the deployment operator before restoration is available.</p>}</section>
    {restoreBackup && <RestoreDatabaseDialog backup={restoreBackup} requiresTotp={status?.restore_requires_totp} busy={busy} onConfirm={restore} onClose={() => setRestoreBackup(null)} />}
    <ConfirmationDialog isOpen={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }} onConfirm={act} busy={busy} title={confirm === 'create' ? 'Create database backup?' : 'Delete database backup?'} description={confirm === 'create' ? 'This creates an encrypted, private snapshot of the current application database.' : 'This permanently deletes the encrypted backup from private storage. The newest successful backup is protected.'} confirmLabel={confirm === 'create' ? 'Create backup' : 'Delete backup'} danger={confirm !== 'create'} />
  </div>;
}
