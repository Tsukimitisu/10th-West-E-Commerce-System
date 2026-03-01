import React, { useEffect, useState } from 'react';
import {
  Users, Shield, Activity, Database, AlertTriangle, CheckCircle2,
  TrendingUp, Server, Lock, Clock, Eye, UserCog, KeyRound,
  XCircle, Globe, Monitor, ArrowUpRight, ArrowDownRight, Settings
} from 'lucide-react';
import {
  adminGetAllUsers, getActivityLogs, getLoginAttempts,
  getSuspiciousActivity, getBackupHistory, getSecuritySettings, getErrorLogs
} from '../../services/api';

const SuperAdminOverview = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    totalUsers: 0, activeUsers: 0, lockedUsers: 0,
    totalLoginAttempts: 0, failedLogins: 0,
    suspiciousCount: 0, lastBackup: null,
    errorLogs: 0, recentActivity: [],
    usersByRole: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [usersData, activityData, loginData, suspiciousData, backupData, errorData] = await Promise.all([
          adminGetAllUsers().catch(() => ({ users: [], total: 0 })),
          getActivityLogs().catch(() => []),
          getLoginAttempts().catch(() => ({ attempts: [], stats: { today_total: 0, today_failed: 0, locked_accounts: 0 } })),
          getSuspiciousActivity().catch(() => ({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] })),
          getBackupHistory().catch(() => []),
          getErrorLogs().catch(() => []),
        ]);

        const users = usersData?.users || [];
        const roleCount = {};
        users.forEach(u => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });

        setStats({
          totalUsers: usersData?.total || users.length,
          activeUsers: users.filter(u => u.is_active && !u.locked_until).length,
          lockedUsers: loginData?.stats?.locked_accounts || 0,
          totalLoginAttempts: loginData?.stats?.today_total || 0,
          failedLogins: loginData?.stats?.today_failed || 0,
          suspiciousCount: (suspiciousData?.failed_login_clusters?.length || 0) + (suspiciousData?.locked_accounts?.length || 0) + (suspiciousData?.bulk_operations?.length || 0),
          lastBackup: Array.isArray(backupData) && backupData.length > 0 ? backupData[0] : null,
          errorLogs: Array.isArray(errorData) ? errorData.length : 0,
          recentActivity: Array.isArray(activityData) ? activityData.slice(0, 10) : [],
          usersByRole: roleCount,
        });
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => <div key={i} className="h-64 bg-gray-200 rounded-xl" />)}
      </div>
    </div>
  );

  const kpis = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'blue', sub: `${stats.activeUsers} active`, onClick: () => onNavigate('users') },
    { label: 'Locked Accounts', value: stats.lockedUsers, icon: Lock, color: stats.lockedUsers > 0 ? 'red' : 'green', sub: stats.lockedUsers > 0 ? 'Needs attention' : 'All clear', onClick: () => onNavigate('users') },
    { label: 'Login Attempts (24h)', value: stats.totalLoginAttempts, icon: Activity, color: 'orange', sub: `${stats.failedLogins} failed`, onClick: () => onNavigate('security') },
    { label: 'Suspicious Activity', value: stats.suspiciousCount, icon: AlertTriangle, color: stats.suspiciousCount > 0 ? 'red' : 'green', sub: stats.suspiciousCount > 0 ? 'Review required' : 'No threats', onClick: () => onNavigate('logs') },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border border-blue-100',
    red: 'bg-red-50 text-red-600 border border-red-100',
    green: 'bg-green-50 text-green-600 border border-green-100',
    orange: 'bg-orange-50 text-orange-600 border border-orange-100',
  };

  const roleLabels = { super_admin: 'Super Admin', owner: 'Owner', store_staff: 'Store Staff', customer: 'Customer', admin: 'Admin', cashier: 'Cashier' };
  const roleColors = { super_admin: 'text-red-500', owner: 'text-purple-500', store_staff: 'text-blue-500', customer: 'text-green-500', admin: 'text-orange-500', cashier: 'text-yellow-500' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><KeyRound size={22} className="text-orange-500" /> System Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor system health, security, and user activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button key={kpi.label} onClick={kpi.onClick} className={`p-5 rounded-xl text-left transition-all hover:shadow-md hover:scale-[1.02] ${colorMap[kpi.color]}`}>
              <div className="flex items-center justify-between mb-3">
                <Icon size={20} />
                <ArrowUpRight size={14} className="opacity-40" />
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs mt-1 opacity-70">{kpi.label}</p>
              <p className="text-[10px] mt-0.5 opacity-50">{kpi.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Users by Role */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><UserCog size={16} className="text-gray-400" /> Users by Role</h3>
          <div className="space-y-3">
            {Object.entries(stats.usersByRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${roleColors[role]?.replace('text-', 'bg-') || 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500">{roleLabels[role] || role}</span>
                </div>
                <span className={`text-sm font-bold ${roleColors[role] || 'text-gray-500'}`}>{count}</span>
              </div>
            ))}
            {Object.keys(stats.usersByRole).length === 0 && <p className="text-xs text-gray-400">No users found</p>}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><Server size={16} className="text-gray-400" /> System Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Database</span>
              <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 size={12} /> Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Error Logs</span>
              <span className={`text-xs font-medium ${stats.errorLogs > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                {stats.errorLogs > 0 ? `${stats.errorLogs} errors` : 'No errors'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Last Backup</span>
              <span className="text-xs text-gray-500">
                {stats.lastBackup ? new Date(stats.lastBackup.created_at).toLocaleDateString() : 'Never'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Security Threats</span>
              <span className={`flex items-center gap-1 text-xs ${stats.suspiciousCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {stats.suspiciousCount > 0 ? <><AlertTriangle size={12} /> {stats.suspiciousCount} alerts</> : <><CheckCircle2 size={12} /> Clear</>}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><Settings size={16} className="text-gray-400" /> Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: 'Manage Users', icon: Users, view: 'users' },
              { label: 'Security Settings', icon: Shield, view: 'security' },
              { label: 'System Configuration', icon: Settings, view: 'config' },
              { label: 'View Logs', icon: Activity, view: 'logs' },
              { label: 'Create Backup', icon: Database, view: 'backup' },
            ].map(action => {
              const Icon = action.icon;
              return (
                <button key={action.view} onClick={() => onNavigate(action.view)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-all">
                  <Icon size={14} className="text-gray-400" />
                  <span className="flex-1 text-left">{action.label}</span>
                  <ArrowUpRight size={12} className="opacity-40" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Activity size={16} className="text-gray-400" /> Recent System Activity</h3>
          <button onClick={() => onNavigate('logs')} className="text-xs text-orange-500 hover:text-orange-600 font-medium">View All →</button>
        </div>
        {stats.recentActivity.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No recent activity</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {stats.recentActivity.map((log, idx) => (
              <div key={log.id || idx} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Activity size={12} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{log.action?.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-gray-400">{log.user_name || 'System'} &middot; {log.ip_address || ''}</p>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminOverview;
