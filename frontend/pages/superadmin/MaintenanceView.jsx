import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Database, ShieldCheck } from 'lucide-react';
import { getSystemSettings } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';

const MaintenanceView = ({ onNavigate }) => {
  const [state, setState] = useState({ loading: true, error: '', storedMode: null });

  useEffect(() => {
    let active = true;
    getSystemSettings('system').then((rows) => {
      const stored = (Array.isArray(rows) ? rows : []).find((row) => row.key === 'maintenance_mode');
      if (active) setState({ loading: false, error: '', storedMode: stored?.value ?? null });
    }).catch(() => {
      if (active) setState({ loading: false, error: 'Maintenance settings could not be loaded.', storedMode: null });
    });
    return () => { active = false; };
  }, []);

  return <div className="space-y-5">
    <PageHeader title="Maintenance" description="Review platform maintenance readiness and recovery routes." />
    {state.loading ? <div role="status" aria-label="Loading maintenance status"><LoadingSkeleton className="h-24 w-full" /></div> : <>
      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <SectionCard title="Traffic control" description="Maintenance mode must be enforced by the server before it can protect customer traffic.">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div><p className="text-sm font-semibold text-slate-950">Stored maintenance setting</p><p className="text-xs text-slate-600">This setting currently has no request blocking middleware.</p></div>
          <StatusBadge tone={state.storedMode === 'true' ? 'warning' : 'neutral'}>{state.storedMode == null ? 'Not set' : state.storedMode === 'true' ? 'Stored as on' : 'Stored as off'}</StatusBadge>
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm text-amber-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />Traffic is not restricted by this setting. Coordinate maintenance through the hosting platform until server enforcement is implemented and tested.</p>
      </SectionCard>
      <SectionCard title="Cleanup & scheduler" description="Read-only operator view. This interface does not execute maintenance.">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">{[['Scheduler status', 'Not exposed by the API'], ['Last cleanup', 'Not exposed by the API'], ['Last result', 'Not exposed by the API']].map(([label, value]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
        <p className="mt-4 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600">Server cleanup covers expired reservations and sessions, idempotency keys, rate-limit records and old notification delivery records. Confirm worker execution and results in server logs.</p>
      </SectionCard>
      <SectionCard title="Preparation" description="Read-only checks before any maintenance window.">
        <div className="divide-y divide-slate-200">
          <button type="button" onClick={() => onNavigate('backup')} className="flex min-h-12 w-full items-center gap-3 text-left text-sm text-slate-700 hover:text-orange-700"><Database size={17} aria-hidden="true" /> Verify backup metadata and recovery instructions <ArrowRight size={15} className="ml-auto" aria-hidden="true" /></button>
          <button type="button" onClick={() => onNavigate('logs')} className="flex min-h-12 w-full items-center gap-3 text-left text-sm text-slate-700 hover:text-orange-700"><ShieldCheck size={17} aria-hidden="true" /> Review audit and error activity <ArrowRight size={15} className="ml-auto" aria-hidden="true" /></button>
        </div>
      </SectionCard>
    </>}
  </div>;
};

export default MaintenanceView;
