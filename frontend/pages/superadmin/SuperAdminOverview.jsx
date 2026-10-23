import React, { useEffect, useMemo, useState } from 'react';
import { actionLabel, actorLabel, auditTime } from '../../utils/auditPresentation.js';
import { ArrowRight } from 'lucide-react';
import { adminGetAllUsers, getActivityLogs, getDatabaseBackups, getErrorLogs, getLoginAttempts, getSuspiciousActivity, getSystemHealth } from '../../services/api';
import ServiceHealth from '../../components/operations/ServiceHealth';
import StatusBadge from '../../components/ui/StatusBadge';
import MetricCard from '../../components/operations/MetricCard';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';

const SuperAdminOverview = ({ onNavigate }) => {
  const [unavailable, setUnavailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    users: [],
    totalUsers: 0,
    activity: [],
    loginStats: {},
    suspicious: {},
    backups: [],
    errors: [],
    health: null,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const failures = [];
      const fallback = (label, value) => () => { failures.push(label); return value; };
      const [users, activity, logins, suspicious, backups, errors, health] = await Promise.all([
        adminGetAllUsers().catch(fallback('Users', { users: [], total: 0 })),
        getActivityLogs().catch(fallback('Activity', [])),
        getLoginAttempts().catch(fallback('Login events', { stats: {} })),
        getSuspiciousActivity().catch(fallback('Security signals', {})),
        getDatabaseBackups().catch(fallback('Database backups', [])),
        getErrorLogs().catch(fallback('Application errors', [])),
        getSystemHealth().catch(fallback('Service readiness', null)),
      ]);
      if (!active) return;
      setUnavailable(failures);
      setData({
        users: users?.users || [],
        totalUsers: users?.total || users?.users?.length || 0,
        activity: Array.isArray(activity) ? activity : activity?.logs || [],
        loginStats: logins?.stats || {},
        suspicious: suspicious || {},
        backups: Array.isArray(backups) ? backups : [],
        errors: Array.isArray(errors) ? errors : [],
        health,
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const staffRoles = new Set(['owner', 'admin', 'store_staff', 'cashier']);
    const activeStaff = data.users.filter((user) => staffRoles.has(user.role) && user.is_active && !user.locked_until).length;
    const suspiciousCount = (
      (data.suspicious.failed_login_clusters?.length || 0)
      + (data.suspicious.locked_accounts?.length || 0)
      + (data.suspicious.bulk_operations?.length || 0)
    );
    return { activeStaff, suspiciousCount };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading system overview">
        <PageHeader title="System overview" description="Loading platform health and administration activity…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  const lastBackup = data.backups.find(backup => backup.status === 'completed' && !backup.deleted_at);
  return <div className="system-overview space-y-5">
    <PageHeader title="System overview" description="Platform readiness, access and operational risk." actions={<button type="button" onClick={() => onNavigate('logs')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold">Review audit trail <ArrowRight size={15} aria-hidden="true" /></button>} />
    {unavailable.length > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Unavailable: {unavailable.join(', ')}. Counts for these sources are incomplete. Reload to retry.</p>}
    <div className="ops-summary-strip">
      <MetricCard label="Accounts" value={unavailable.includes('Users') ? '—' : data.totalUsers} detail="Registered platform users" onClick={() => onNavigate('users')} />
      <MetricCard label="Enabled team accounts" value={unavailable.includes('Users') ? '—' : summary.activeStaff} detail="From the loaded user page" onClick={() => onNavigate('users')} />
      <MetricCard label="Security signals" value={unavailable.includes('Security signals') ? '—' : summary.suspiciousCount} detail="Review authentication anomalies" onClick={() => onNavigate('security')} />
      <MetricCard label="Application errors" value={unavailable.includes('Application errors') ? '—' : data.errors.length} detail="Loaded error records" onClick={() => onNavigate('monitoring')} />
    </div>
    <div className="system-overview-grid">
      <SectionCard title="Service readiness" description={data.health?.timestamp ? `Last checked ${new Date(data.health.timestamp).toLocaleString('en-PH')}. Configuration readiness does not confirm a completed transaction.` : 'The readiness endpoint did not respond. Service states remain unconfirmed.'} padded={false}>
        <ServiceHealth health={data.health} />
      </SectionCard>
      <div className="space-y-5">
        <SectionCard title="Runtime & recovery" description="Reported environment and recovery capability.">
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-600">Environment</dt><dd className="font-medium">{data.health?.runtime?.environment || 'Not reported'}</dd></div>
            <div><dt className="text-slate-600">Session storage</dt><dd className="mt-1 font-mono text-xs">{data.health?.runtime?.session_store || 'Not reported'}</dd></div>
            <div><dt className="text-slate-600">Active session count</dt><dd className="mt-1 text-xs">Not reported by this endpoint</dd></div>
            <div><dt className="text-slate-600">Last successful backup</dt><dd className="mt-1 text-xs">{lastBackup?.created_at ? new Date(lastBackup.created_at).toLocaleString('en-PH') : 'No record available'}</dd></div>
          </dl>
          <button type="button" onClick={() => onNavigate('backup')} className="mt-4 min-h-11 text-sm font-semibold text-orange-800">Review backup & recovery <ArrowRight size={14} className="inline" aria-hidden="true" /></button>
        </SectionCard>
        <SectionCard title="Security review" description="Authentication signals from the loaded logs.">
          {[
            ['Failed logins today', Number(data.loginStats.today_failed || 0)],
            ['Locked accounts', Number(data.loginStats.locked_accounts || 0)],
            ['Suspicious activity groups', summary.suspiciousCount],
          ].map(([label, value]) => <button key={label} type="button" onClick={() => onNavigate('security')} className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-slate-100 text-left text-sm"><span className="text-slate-600">{label}</span><StatusBadge tone={value ? 'warning' : 'neutral'}>{value}</StatusBadge></button>)}
        </SectionCard>
      </div>
    </div>
    <div className="system-overview-grid">
      <SectionCard title="Latest system events" description="Recent auditable platform activity." padded={false}>
        {data.activity.length ? data.activity.slice(0, 7).map((log, index) => <div key={log.id || index} className="ops-event-row"><p>{actionLabel(log)}</p><small>{actorLabel(log)} · {auditTime(log.created_at)}</small></div>) : <p className="p-5 text-sm text-slate-600">No activity records available.</p>}
      </SectionCard>
      <SectionCard title="Administration" description="Access, governance and platform controls.">
        {[['Manage users & roles', 'users'], ['Review security controls', 'security'], ['Maintenance status', 'maintenance'], ['Platform configuration', 'config']].map(([label, view]) => <button key={view} type="button" onClick={() => onNavigate(view)} className="flex min-h-12 w-full items-center justify-between border-b border-slate-100 text-left text-sm">{label}<ArrowRight size={15} aria-hidden="true" /></button>)}
      </SectionCard>
    </div>
  </div>;
};

export default SuperAdminOverview;
