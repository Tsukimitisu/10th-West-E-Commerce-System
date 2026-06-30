import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Lock,
  Server,
  ShoppingCart,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import {
  adminGetAllUsers,
  getActivityLogs,
  getBackupHistory,
  getDashboardStats,
  getErrorLogs,
  getLoginAttempts,
  getOrders,
  getSuspiciousActivity,
  getSystemHealth,
} from '../../services/api';
import MetricCard from '../../components/operations/MetricCard';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';

const currency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const SuperAdminOverview = ({ onNavigate }) => {
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
    commerce: null,
    orders: [],
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const [users, activity, logins, suspicious, backups, errors, health, commerce, orders] = await Promise.all([
        adminGetAllUsers().catch(() => ({ users: [], total: 0 })),
        getActivityLogs().catch(() => []),
        getLoginAttempts().catch(() => ({ stats: {} })),
        getSuspiciousActivity().catch(() => ({})),
        getBackupHistory().catch(() => []),
        getErrorLogs().catch(() => []),
        getSystemHealth().catch(() => null),
        getDashboardStats().catch(() => null),
        getOrders().catch(() => []),
      ]);
      if (!active) return;
      setData({
        users: users?.users || [],
        totalUsers: users?.total || users?.users?.length || 0,
        activity: Array.isArray(activity) ? activity : [],
        loginStats: logins?.stats || {},
        suspicious: suspicious || {},
        backups: Array.isArray(backups) ? backups : [],
        errors: Array.isArray(errors) ? errors : [],
        health,
        commerce,
        orders: Array.isArray(orders) ? orders : [],
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
    const paymentIssues = data.orders.filter((order) => ['payment_pending', 'failed'].includes(order.status)).length;
    const roleCounts = data.users.reduce((counts, user) => ({
      ...counts,
      [user.role]: (counts[user.role] || 0) + 1,
    }), {});
    return { activeStaff, suspiciousCount, paymentIssues, roleCounts };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-16 max-w-2xl rounded-xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  const healthRows = [
    ['Database', data.health?.database === 'ok', data.health?.database === 'ok' ? 'Connected' : 'Unavailable'],
    ['PayMongo', data.health?.paymongo === 'configured', data.health?.paymongo === 'configured' ? 'Configured' : 'Not configured'],
    ['J&T courier', data.health?.jnt === 'configured', data.health?.jnt === 'configured' ? 'Configured' : data.health?.jnt === 'mock' ? 'Development mock' : 'Not configured'],
    ['Application errors', data.errors.length === 0, data.errors.length ? `${data.errors.length} logged` : 'No errors'],
  ];
  const lastBackup = data.backups[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform control"
        title="System overview"
        description="Executive view of platform access, commerce activity, service configuration, and security signals."
        actions={(
          <button type="button" onClick={() => onNavigate('logs')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Review audit logs <ArrowRight size={15} />
          </button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Total users" value={data.totalUsers} detail={`${data.users.filter((user) => user.is_active).length} active accounts`} tone="info" onClick={() => onNavigate('users')} />
        <MetricCard icon={UserCog} label="Active staff & admins" value={summary.activeStaff} detail="Enabled operational accounts" tone="brand" onClick={() => onNavigate('users')} />
        <MetricCard icon={CircleDollarSign} label="Platform sales" value={currency(data.commerce?.totalSales)} detail="Revenue reported by commerce services" tone="success" />
        <MetricCard icon={ShoppingCart} label="Orders" value={data.commerce?.totalOrders ?? data.orders.length} detail={`${summary.paymentIssues} payment issue${summary.paymentIssues === 1 ? '' : 's'}`} tone={summary.paymentIssues ? 'warning' : 'neutral'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="System health" description="Live readiness checks and integration state.">
          <div className="space-y-3">
            {healthRows.map(([label, healthy, value]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-600">{label}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${healthy ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {healthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {value}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-600">Last backup</span>
              <span className="text-xs font-semibold text-slate-700">{lastBackup?.created_at ? new Date(lastBackup.created_at).toLocaleString() : 'Never'}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Security posture" description="Authentication and anomaly signals from live logs.">
          <div className="space-y-3">
            {[
              ['Failed logins (24h)', Number(data.loginStats.today_failed || 0), Lock],
              ['Locked accounts', Number(data.loginStats.locked_accounts || 0), Lock],
              ['Suspicious events', summary.suspiciousCount, AlertTriangle],
            ].map(([label, value, Icon]) => (
              <button key={label} type="button" onClick={() => onNavigate('security')} className="flex w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                <span className="flex items-center gap-2 text-sm text-slate-600"><Icon size={15} className="text-slate-400" /> {label}</span>
                <span className={`text-sm font-bold ${value ? 'text-red-700' : 'text-emerald-700'}`}>{value}</span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Users by role" description="Current account distribution.">
          <div className="space-y-3">
            {Object.entries(summary.roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between gap-3">
                <span className="text-sm capitalize text-slate-600">{role.replace(/_/g, ' ')}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{count}</span>
              </div>
            ))}
            {!Object.keys(summary.roleCounts).length && <p className="py-6 text-center text-sm text-slate-500">No user records available.</p>}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <SectionCard title="Latest platform activity" description="Most recent auditable actions." action={<button type="button" onClick={() => onNavigate('logs')} className="text-xs font-semibold text-orange-700">View all</button>} padded={false}>
          {data.activity.length ? (
            <div className="divide-y divide-slate-100">
              {data.activity.slice(0, 8).map((log, index) => (
                <div key={log.id || index} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Activity size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize text-slate-800">{String(log.action || 'System activity').replace(/_/g, ' ')}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{log.user_name || 'System'}{log.ip_address ? ` · ${log.ip_address}` : ''}</p>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</time>
                </div>
              ))}
            </div>
          ) : <div className="px-5 py-12 text-center text-sm text-slate-500">No recent platform activity.</div>}
        </SectionCard>

        <SectionCard title="Administrative actions" description="Common platform controls.">
          <div className="space-y-2">
            {[
              ['Manage users & roles', Users, 'users'],
              ['Review security controls', Lock, 'security'],
              ['System configuration', Server, 'config'],
              ['Backup & recovery', Database, 'backup'],
            ].map(([label, Icon, view]) => (
              <button key={view} type="button" onClick={() => onNavigate(view)} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-slate-200 px-3 text-left text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50">
                <Icon size={16} className="text-slate-400" /><span className="flex-1">{label}</span><ArrowRight size={14} className="text-slate-400" />
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default SuperAdminOverview;
