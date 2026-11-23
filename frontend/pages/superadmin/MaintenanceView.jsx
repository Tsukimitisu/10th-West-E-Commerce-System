import React, { useCallback, useEffect, useState } from 'react';
import { getOperationsStatus, changeMaintenanceMode } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';
import StatusBadge from '../../components/ui/StatusBadge';
import BrandButton from '../../components/ui/BrandButton';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import Modal from '../../components/owner/Modal';
import { safeDiagnosticSummary } from '../../utils/operationsDiagnostics.js';

const time = value => value ? new Date(value).toLocaleString('en-PH') : 'Not captured';
const labels = { healthy: 'Healthy', needs_attention: 'Needs attention', not_running: 'Not running', unavailable: 'Unavailable', online: 'Online', connected: 'Connected', configured: 'Configured', successful: 'Successful', failed: 'Failed', not_captured: 'Not captured' };
const tone = status => ['healthy', 'online', 'connected', 'successful'].includes(status) ? 'success' : ['needs_attention', 'not_running'].includes(status) ? 'warning' : status === 'failed' ? 'danger' : 'neutral';
const emptyForm = () => ({ reason: '', message: '', password: '', totp_code: '', acknowledgement: false });

export default function MaintenanceView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getOperationsStatus()); setError(''); }
    catch { setError('System checks are unavailable. Refresh before changing store status.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const state = data?.maintenance, cleanup = data?.cleanup, diagnostics = data?.diagnostics;
  const close = () => { if (!busy) { setConfirming(false); setForm(emptyForm()); } };
  const submit = async event => {
    event.preventDefault();
    if (busy || !state) return;
    setBusy(true); setError('');
    try {
      await changeMaintenanceMode({ ...form, active: !state.active });
      setConfirming(false); setForm(emptyForm());
      setFeedback(state.active ? 'Maintenance ended. The store is open normally.' : 'Maintenance started. Customer changes are now paused.');
      await load();
    } catch (err) {
      if (err.status === 409) { setConfirming(false); setForm(emptyForm()); await load(); }
      setError(err.message || 'Store status could not be changed. Refresh and try again.');
    }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(safeDiagnosticSummary(diagnostics), null, 2)); setFeedback('Safe diagnostic summary copied. You can share it with support.'); }
    catch { setError('The summary could not be copied. Allow clipboard access and try again.'); }
  };
  const counts = cleanup?.last_counts;
  return <div className="space-y-5">
    <PageHeader title="Maintenance" description="Plan safe pauses and find help when something needs attention." />
    {feedback && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</p>}
    {error && !confirming && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading && !data ? <LoadingSkeleton className="h-40 w-full" /> : <>
      <SectionCard title="Store status" description="Only a Super Admin can start or end a maintenance pause.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><StatusBadge dot tone={!state ? 'neutral' : state.active ? 'warning' : 'success'}>{!state ? 'Unavailable' : state.active ? 'Maintenance mode active' : 'Open normally'}</StatusBadge><p className="mt-3 text-sm leading-6 text-slate-700">{state?.active ? 'Customer shopping and account pages are paused while the shop website is being maintained.' : state ? 'Customers can browse, order and pay normally.' : 'The current store status could not be checked. Refresh checks before continuing.'}</p></div>
          <BrandButton variant={state?.active ? 'secondary' : 'danger'} disabled={!state || loading} onClick={() => { setError(''); setConfirming(true); }}>{state?.active ? 'End Maintenance' : 'Start Maintenance'}</BrandButton>
        </div>
        {state?.active && <>
          <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-3">{[['Customer traffic', 'Restricted — storefront maintenance page'], ['Admin operations', 'Available — existing permissions apply'], ['System integrations', 'Available — not paused by maintenance']].map(([label, value]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-medium text-slate-950">{value}</dd></div>)}</dl>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-600">Started by</dt><dd>{state.started_by_unavailable ? 'Unavailable' : state.started_by_name || 'Not captured'}</dd></div><div><dt className="text-slate-600">Started</dt><dd>{time(state.started_at)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-600">Reason</dt><dd className="break-words">{state.reason || 'Not captured for this earlier maintenance window.'}</dd></div><div className="sm:col-span-2"><dt className="text-slate-600">Customer message</dt><dd className="break-words">{state.message}</dd></div></dl>
        </>}
      </SectionCard>
      <SectionCard title="Automatic cleanup" description="Expired temporary records are cleared automatically. No manual action is required when this is healthy.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-600">Status</dt><dd className="mt-1"><StatusBadge tone={tone(cleanup?.status)}>{labels[cleanup?.status] || 'Unavailable'}</StatusBadge></dd></div>
          <div><dt className="text-slate-600">Last cleanup</dt><dd className="mt-1">{cleanup?.status === 'unavailable' ? 'Unavailable' : time(cleanup?.last_cleanup)}</dd></div>
          <div><dt className="text-slate-600">Last result</dt><dd className="mt-1">{cleanup?.status === 'unavailable' ? 'Unavailable' : labels[cleanup?.last_result] || 'Not captured'}</dd></div>
          <div><dt className="text-slate-600">Next expected run</dt><dd className="mt-1">{cleanup?.status === 'unavailable' ? 'Unavailable' : cleanup?.disabled ? 'Not scheduled while cleanup is disabled' : time(cleanup?.next_expected_run)}</dd></div>
        </dl>
        {counts && <div className="mt-4 border-t border-slate-200 pt-4 text-sm"><p className="font-semibold">{cleanup.last_result === 'failed' ? 'Before cleanup stopped, it cleared:' : 'Last cleanup cleared:'}</p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{[
          [Number(counts.sessions_expired || 0) + Number(counts.http_sessions_deleted || 0), 'expired session records'],
          [counts.reservations_released, 'expired stock reservations'], [counts.idempotency_keys_deleted, 'old duplicate-request protection records'],
          [counts.rate_limits_deleted, 'old request-limit records'], [counts.notification_deliveries_deleted, 'expired notification-delivery records'],
        ].map(([count, label]) => <li key={label}>{Number(count || 0).toLocaleString()} {label}</li>)}</ul></div>}
        {cleanup?.status !== 'healthy' && <p className="mt-4 text-sm leading-6 text-amber-900">{cleanup?.status === 'unavailable' ? 'Cleanup history could not be retrieved. The administrator should check that the latest system update has been applied.' : cleanup?.stale ? 'An expected cleanup has not checked in recently. Refresh checks; if this continues, contact your system administrator.' : 'Cleanup has not completed successfully yet, or automatic cleanup is turned off. Refresh checks and contact your system administrator if this continues.'}</p>}
      </SectionCard>
      <SectionCard title="Support & diagnostics" description="See what is available and copy a safe summary when asking for help.">
        <dl className="divide-y divide-slate-200 text-sm">{diagnostics && [
          ['Overall system', diagnostics.overall], ['Website', diagnostics.website], ['Database', diagnostics.database], ['Email', diagnostics.email], ['Payments', diagnostics.payments], ['Last backup', diagnostics.backup?.status], ['Automatic cleanup', diagnostics.cleanup?.status],
        ].map(([label, status]) => <div key={label} className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="font-medium">{label}</dt><dd><StatusBadge tone={tone(status)}>{labels[status] || 'Unavailable'}</StatusBadge></dd></div>)}</dl>
        <p className="mt-3 text-sm text-slate-700">Recent errors (24h): <strong>{diagnostics?.recent_errors_24h ?? 'Unavailable'}</strong></p>
        <p className="mt-2 text-sm leading-6 text-slate-600">Email and payment checks confirm configuration. They do not send a test email or create a payment. Last successful backup: {diagnostics?.backup?.status === 'unavailable' ? 'Unavailable' : time(diagnostics?.backup?.time)}.</p>
        <div className="mt-4 flex flex-wrap gap-2"><BrandButton variant="secondary" onClick={() => onNavigate('monitoring')}>View recent errors</BrandButton><BrandButton variant="secondary" onClick={() => onNavigate('backup')}>Backup & recovery</BrandButton><BrandButton variant="secondary" disabled={loading} onClick={load}>{loading ? 'Checking…' : 'Refresh checks'}</BrandButton><BrandButton variant="ghost" disabled={!diagnostics} onClick={copy}>Copy diagnostic summary</BrandButton></div>
        {diagnostics && <p className="mt-3 break-words text-xs leading-6 text-slate-600">Checked {time(diagnostics.timestamp)} · Support reference: {diagnostics.reference}</p>}
      </SectionCard>
    </>}
    <Modal isOpen={confirming} onClose={close} title={state?.active ? 'End maintenance?' : 'Start maintenance?'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{state?.active ? 'The store will reopen for customer changes, new orders and payments.' : 'Customers will see a maintenance message and cannot change accounts, place orders or start payments. Sign-in, password recovery, existing payment updates, approved shop operations and background tasks remain available. Requests already in progress may finish.'}</div>
        <label className="block text-sm font-medium">Reason<textarea required maxLength={500} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3" /></label>
        {!state?.active && <label className="block text-sm font-medium">Customer-facing message (optional)<textarea maxLength={500} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3" /><span className="mt-1 block text-xs font-normal text-slate-600">Leave blank to use the friendly default message. Do not include private information.</span></label>}
        <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={form.acknowledgement} onChange={e => setForm({ ...form, acknowledgement: e.target.checked })} />I understand who will be affected by this change.</label>
        <label className="block text-sm font-medium">Current Super Admin password<input type="password" required autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
        {data?.requires_totp && <label className="block text-sm font-medium">Current authenticator code<input required type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={form.totp_code} onChange={e => setForm({ ...form, totp_code: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><BrandButton variant="secondary" disabled={busy} onClick={close}>Cancel</BrandButton><BrandButton type="submit" variant={state?.active ? 'primary' : 'danger'} disabled={busy || !form.acknowledgement || !form.reason.trim() || !form.password || data?.requires_totp && !/^\d{6}$/.test(form.totp_code)}>{busy ? 'Changing store status…' : state?.active ? 'End Maintenance' : 'Start Maintenance'}</BrandButton></div>
      </form>
    </Modal>
  </div>;
}
