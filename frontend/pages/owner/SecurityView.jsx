import React, { useEffect, useState } from 'react';
import { getAllPermissions, getActivityLogs, getDeviceHistory, getAuditLogs, getSecuritySettings, updateSecuritySettings, getLoginAttempts, getSuspiciousActivity } from '../../services/api';
import { Shield, Search, Lock, Eye, UserCog, Clock, AlertTriangle, CheckCircle2, XCircle, Key, Globe, Activity, Monitor, FileText, Settings, LockKeyhole, Wifi } from 'lucide-react';

const SecurityView = () => {
  const [tab, setTab] = useState('roles');
  const [permissions, setPermissions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLogs, setSearchLogs] = useState('');
  const [deviceHistory, setDeviceHistory] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sessionTimeout, setSessionTimeout] = useState(() => localStorage.getItem('sessionTimeout') || '30');

  // Login Monitor state
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [loginStats, setLoginStats] = useState({ today_total: 0, today_failed: 0, locked_accounts: 0 });
  const [suspicious, setSuspicious] = useState({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] });
  const [loginSearchEmail, setLoginSearchEmail] = useState('');
  const [loginStatusFilter, setLoginStatusFilter] = useState('all');

  // Security Config state
  const [securityConfig, setSecurityConfig] = useState({
    max_login_attempts: '5',
    lockout_duration_minutes: '15',
    password_min_length: '8',
    password_require_uppercase: 'true',
    password_require_lowercase: 'true',
    password_require_numbers: 'true',
    password_require_special: 'true',
    two_factor_enforcement: 'optional',
    session_timeout_minutes: '30',
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [perms, logs, devices, audit, secSettings, loginData, suspiciousData] = await Promise.all([
          getAllPermissions().catch(() => []),
          getActivityLogs().catch(() => []),
          getDeviceHistory().catch(() => []),
          getAuditLogs().catch(() => []),
          getSecuritySettings().catch(() => ({})),
          getLoginAttempts().catch(() => ({ attempts: [], stats: { today_total: 0, today_failed: 0, locked_accounts: 0 } })),
          getSuspiciousActivity().catch(() => ({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] })),
        ]);
        setPermissions(Array.isArray(perms) ? perms : []);
        setActivityLogs(Array.isArray(logs) ? logs : []);
        setDeviceHistory(Array.isArray(devices) ? devices : []);
        setAuditLogs(Array.isArray(audit) ? audit : []);

        // Security settings
        if (secSettings && typeof secSettings === 'object' && !Array.isArray(secSettings)) {
          setSecurityConfig(prev => ({ ...prev, ...secSettings }));
          if (secSettings.session_timeout_minutes) {
            setSessionTimeout(secSettings.session_timeout_minutes);
          }
        }

        // Login attempts
        if (loginData) {
          setLoginAttempts(Array.isArray(loginData.attempts) ? loginData.attempts : (Array.isArray(loginData) ? loginData : []));
          if (loginData.stats) setLoginStats(loginData.stats);
        }

        // Suspicious activity
        if (suspiciousData) setSuspicious(suspiciousData);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const roles = [
    { name: 'Admin', color: 'bg-orange-50 text-orange-600 border-orange-200', desc: 'Full system access', permsCount: 'All' },
    { name: 'Manager', color: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'Manage orders, products, staff', permsCount: '15' },
    { name: 'Cashier', color: 'bg-green-50 text-green-700 border-green-200', desc: 'POS access, order processing', permsCount: '8' },
    { name: 'Viewer', color: 'bg-gray-50 text-gray-700 border-gray-200', desc: 'Read-only access to reports', permsCount: '3' },
  ];

  const permissionGroups = [
    { group: 'Products', perms: ['products.view', 'products.create', 'products.edit', 'products.delete'] },
    { group: 'Orders', perms: ['orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.refund'] },
    { group: 'Inventory', perms: ['inventory.view', 'inventory.adjust', 'inventory.import'] },
    { group: 'Reports', perms: ['reports.view', 'reports.export'] },
    { group: 'Staff', perms: ['staff.view', 'staff.create', 'staff.edit', 'staff.delete'] },
    { group: 'Settings', perms: ['settings.view', 'settings.edit'] },
    { group: 'POS', perms: ['pos.access', 'pos.discount', 'pos.void'] },
    { group: 'Returns', perms: ['returns.view', 'returns.approve', 'returns.refund'] },
  ];

  const rolePerms = {
    Admin: permissionGroups.flatMap(g => g.perms),
    Manager: ['products.view', 'products.create', 'products.edit', 'orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.refund', 'inventory.view', 'inventory.adjust', 'reports.view', 'reports.export', 'staff.view', 'pos.access', 'pos.discount', 'returns.view', 'returns.approve', 'returns.refund'],
    Cashier: ['products.view', 'orders.view', 'orders.create', 'inventory.view', 'pos.access', 'pos.discount', 'returns.view', 'returns.approve'],
    Viewer: ['products.view', 'orders.view', 'reports.view'],
  };

  const filteredLogs = activityLogs.filter(l => {
    const term = searchLogs.toLowerCase();
    return !term || l.action?.toLowerCase().includes(term) || l.user_name?.toLowerCase().includes(term) || l.details?.toLowerCase().includes(term);
  });

  const filteredLoginAttempts = loginAttempts.filter(a => {
    const emailMatch = !loginSearchEmail || (a.email || '').toLowerCase().includes(loginSearchEmail.toLowerCase());
    const statusMatch = loginStatusFilter === 'all' || (loginStatusFilter === 'success' && a.success) || (loginStatusFilter === 'failed' && !a.success);
    return emailMatch && statusMatch;
  });

  const handleSessionTimeoutChange = (value) => {
    setSessionTimeout(value);
    localStorage.setItem('sessionTimeout', value);
  };

  const handleConfigChange = (key, value) => {
    setSecurityConfig(prev => ({ ...prev, [key]: value }));
    setConfigSaved(false);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      await updateSecuritySettings(securityConfig);
      // Also sync session timeout to localStorage
      if (securityConfig.session_timeout_minutes) {
        handleSessionTimeoutChange(securityConfig.session_timeout_minutes);
      }
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save security settings:', e);
    }
    setSavingConfig(false);
  };

  const failureRate = loginStats.today_total > 0
    ? ((loginStats.today_failed / loginStats.today_total) * 100).toFixed(1)
    : '0.0';

  const tabs = [
    { id: 'roles', label: 'Roles', icon: UserCog },
    { id: 'permissions', label: 'Permissions Matrix', icon: Key },
    { id: 'logs', label: 'Activity Logs', icon: Activity },
    { id: 'devices', label: 'Device History', icon: Monitor },
    { id: 'audit', label: 'Audit Trail', icon: FileText },
    { id: 'loginMonitor', label: 'Login Monitor', icon: Wifi },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-gray-900">Security & Roles</h1>
        <p className="text-sm text-gray-500">Role-based access control and activity monitoring</p>
      </div>

      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-orange-50 text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Roles Tab */}
          {tab === 'roles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roles.map(role => (
                <div key={role.name} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${role.color}`}>
                      <Shield size={12} /> {role.name}
                    </span>
                    <span className="text-xs text-gray-400">{role.permsCount} permissions</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{role.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {rolePerms[role.name]?.slice(0, 6).map(p => (
                      <span key={p} className="px-1.5 py-0.5 bg-gray-50 text-[10px] font-mono text-gray-500 rounded">{p}</span>
                    ))}
                    {(rolePerms[role.name]?.length || 0) > 6 && (
                      <span className="px-1.5 py-0.5 bg-gray-50 text-[10px] text-gray-400 rounded">+{(rolePerms[role.name]?.length || 0) - 6} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Permissions Matrix Tab */}
          {tab === 'permissions' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">Permission</th>
                    {roles.map(r => (
                      <th key={r.name} className="text-center px-4 py-3 text-xs font-medium text-gray-500 min-w-[80px]">{r.name}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {permissionGroups.map((group, gi) => (
                      <React.Fragment key={group.group}>
                        <tr className="bg-gray-50/50"><td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wide">{group.group}</td></tr>
                        {group.perms.map(perm => (
                          <tr key={perm} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-600 sticky left-0 bg-white">{perm}</td>
                            {roles.map(r => {
                              const has = rolePerms[r.name]?.includes(perm);
                              return (
                                <td key={r.name} className="text-center px-4 py-2.5">
                                  {has ? (
                                    <CheckCircle2 size={16} className="mx-auto text-green-500" />
                                  ) : (
                                    <XCircle size={16} className="mx-auto text-gray-200" />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Activity Logs Tab */}
          {tab === 'logs' && (
            <>
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search activity..." value={searchLogs} onChange={e => setSearchLogs(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filteredLogs.length === 0 ? (
                  <div className="p-12 text-center"><Activity size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">No activity logs found</p></div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {filteredLogs.slice(0, 100).map((log, i) => {
                      const action = log.action || '';
                      const isLogin = action.toLowerCase().includes('login');
                      const isFailed = action.toLowerCase().includes('fail');
                      return (
                        <div key={i} className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isFailed ? 'bg-orange-50' : isLogin ? 'bg-green-50' : 'bg-blue-50'}`}>
                            {isFailed ? <AlertTriangle size={14} className="text-orange-500" /> : isLogin ? <Globe size={14} className="text-green-500" /> : <Activity size={14} className="text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{log.user_name || `User #${log.user_id || '?'}`}</span>
                              <span className="text-gray-500"> — {action}</span>
                            </p>
                            {log.details && <p className="text-xs text-gray-400 mt-0.5 truncate">{log.details}</p>}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                              <span className="flex items-center gap-0.5"><Clock size={9} /> {new Date(log.created_at || log.timestamp).toLocaleString()}</span>
                              {log.ip_address && <span className="flex items-center gap-0.5"><Globe size={9} /> {log.ip_address}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Device Login History Tab */}
          {tab === 'devices' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Monitor size={16} className="text-orange-500" />
                  <h3 className="font-semibold text-sm text-gray-900">Device Login History</h3>
                  <span className="ml-auto text-xs text-gray-400">{deviceHistory.length} entries</span>
                </div>
                {deviceHistory.length === 0 ? (
                  <div className="p-12 text-center">
                    <Monitor size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No device login history available</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Device</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">IP Address</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Login Time</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {deviceHistory.map((device, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                                  <Monitor size={12} className="text-orange-500" />
                                </div>
                                <span className="text-sm text-gray-700 truncate max-w-[220px]">{device.device_info || 'Unknown Device'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-gray-50 text-xs font-mono text-gray-600 rounded">{device.ip_address || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Clock size={10} /> {device.login_at ? new Date(device.login_at).toLocaleString() : 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1 text-xs text-gray-500"><Globe size={10} /> {device.location || 'Unknown'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Audit Trail Tab */}
          {tab === 'audit' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <FileText size={16} className="text-orange-500" />
                  <h3 className="font-semibold text-sm text-gray-900">Audit Trail</h3>
                  <span className="ml-auto text-xs text-gray-400">Recent system activity</span>
                </div>
                {auditLogs.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No audit logs available</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {auditLogs.slice(0, 100).map((log, i) => {
                      const action = log.action || '';
                      const isWrite = action.toLowerCase().includes('create') || action.toLowerCase().includes('update') || action.toLowerCase().includes('delete');
                      const isAuth = action.toLowerCase().includes('login') || action.toLowerCase().includes('logout');
                      return (
                        <div key={i} className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isWrite ? 'bg-orange-50' : isAuth ? 'bg-green-50' : 'bg-blue-50'}`}>
                            {isWrite ? <FileText size={14} className="text-orange-500" /> : isAuth ? <LockKeyhole size={14} className="text-green-500" /> : <Activity size={14} className="text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{log.user_name || log.users?.name || `User #${log.user_id || '?'}`}</span>
                              <span className="text-gray-500"> — {action}</span>
                            </p>
                            {log.details && <p className="text-xs text-gray-400 mt-0.5 truncate">{log.details}</p>}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                              <span className="flex items-center gap-0.5"><Clock size={9} /> {new Date(log.created_at || log.timestamp).toLocaleString()}</span>
                              {log.ip_address && <span className="flex items-center gap-0.5"><Globe size={9} /> {log.ip_address}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Login Monitor Tab */}
          {tab === 'loginMonitor' && (
            <div className="space-y-4">
              {/* Summary Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                      <Wifi size={14} className="text-blue-500" />
                    </div>
                    <span className="text-xs text-gray-500">Today's Attempts</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{loginStats.today_total}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                      <XCircle size={14} className="text-red-500" />
                    </div>
                    <span className="text-xs text-gray-500">Failed Today</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{loginStats.today_failed}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                      <Lock size={14} className="text-orange-500" />
                    </div>
                    <span className="text-xs text-gray-500">Locked Accounts</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">{loginStats.locked_accounts}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center">
                      <AlertTriangle size={14} className="text-yellow-500" />
                    </div>
                    <span className="text-xs text-gray-500">Failure Rate</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{failureRate}%</p>
                </div>
              </div>

              {/* Suspicious Activity Alert */}
              {(suspicious.locked_accounts?.length > 0) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Suspicious Activity Detected</p>
                      <p className="text-xs text-red-600 mt-1">
                        {suspicious.locked_accounts.length} account{suspicious.locked_accounts.length !== 1 ? 's' : ''} currently locked due to excessive failed login attempts.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suspicious.locked_accounts.map((acct, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            <Lock size={10} /> {acct.email || acct.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-xs flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by email..."
                    value={loginSearchEmail}
                    onChange={e => setLoginSearchEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <select
                  value={loginStatusFilter}
                  onChange={e => setLoginStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Login Attempts Table */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Wifi size={16} className="text-orange-500" />
                  <h3 className="font-semibold text-sm text-gray-900">Login Attempts</h3>
                  <span className="ml-auto text-xs text-gray-400">{filteredLoginAttempts.length} entries</span>
                </div>
                {filteredLoginAttempts.length === 0 ? (
                  <div className="p-12 text-center">
                    <Wifi size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No login attempts found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">IP Address</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Time</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredLoginAttempts.slice(0, 100).map((attempt, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-700 font-medium">{attempt.email || 'Unknown'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {attempt.success ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium border border-green-200">
                                  <CheckCircle2 size={10} /> Success
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full font-medium border border-red-200">
                                  <XCircle size={10} /> Failed
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-gray-50 text-xs font-mono text-gray-600 rounded">{attempt.ip_address || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock size={10} /> {attempt.created_at ? new Date(attempt.created_at).toLocaleString() : 'N/A'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">
                              {attempt.user_agent || attempt.reason || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {tab === 'settings' && (
            <div className="space-y-4">
              {/* Account Lockout Policy */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                    <LockKeyhole size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">Account Lockout Policy</h3>
                    <p className="text-xs text-gray-400">Protects accounts from brute-force attacks</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Login Attempts</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={securityConfig.max_login_attempts}
                      onChange={e => handleConfigChange('max_login_attempts', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Number of failed attempts before lockout</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Lockout Duration (minutes)</label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={securityConfig.lockout_duration_minutes}
                      onChange={e => handleConfigChange('lockout_duration_minutes', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">How long accounts stay locked</p>
                  </div>
                </div>
              </div>

              {/* Password Policy */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                    <Key size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">Password Policy</h3>
                    <p className="text-xs text-gray-400">Define password strength requirements</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="max-w-xs">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Password Length</label>
                    <input
                      type="number"
                      min="6"
                      max="32"
                      value={securityConfig.password_min_length}
                      onChange={e => handleConfigChange('password_min_length', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securityConfig.password_require_uppercase === 'true'}
                        onChange={e => handleConfigChange('password_require_uppercase', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500/20"
                      />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Require Uppercase</span>
                        <p className="text-[10px] text-gray-400">At least one uppercase letter (A-Z)</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securityConfig.password_require_lowercase === 'true'}
                        onChange={e => handleConfigChange('password_require_lowercase', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500/20"
                      />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Require Lowercase</span>
                        <p className="text-[10px] text-gray-400">At least one lowercase letter (a-z)</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securityConfig.password_require_numbers === 'true'}
                        onChange={e => handleConfigChange('password_require_numbers', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500/20"
                      />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Require Numbers</span>
                        <p className="text-[10px] text-gray-400">At least one digit (0-9)</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securityConfig.password_require_special === 'true'}
                        onChange={e => handleConfigChange('password_require_special', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500/20"
                      />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Require Special Characters</span>
                        <p className="text-[10px] text-gray-400">At least one special character (!@#$%...)</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* 2FA Enforcement */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                    <Shield size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-xs text-gray-400">Enforce 2FA for user groups</p>
                  </div>
                </div>
                <select
                  value={securityConfig.two_factor_enforcement}
                  onChange={e => handleConfigChange('two_factor_enforcement', e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white w-full max-w-xs"
                >
                  <option value="optional">Optional for All Users</option>
                  <option value="required_admins">Required for Admins Only</option>
                  <option value="required_all">Required for All Users</option>
                </select>
              </div>

              {/* Session Timeout Setting */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                    <Clock size={16} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">Session Timeout</h3>
                    <p className="text-xs text-gray-400">Auto-logout after period of inactivity</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={securityConfig.session_timeout_minutes}
                    onChange={e => {
                      handleConfigChange('session_timeout_minutes', e.target.value);
                      handleSessionTimeoutChange(e.target.value);
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                  <span className="text-xs text-gray-400">
                    Currently set to {sessionTimeout === '15' ? '15 minutes' : sessionTimeout === '30' ? '30 minutes' : sessionTimeout === '60' ? '1 hour' : '2 hours'}
                  </span>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="px-6 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingConfig ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Settings size={14} />
                      Save Security Settings
                    </>
                  )}
                </button>
                {configSaved && (
                  <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                    <CheckCircle2 size={16} /> Saved!
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SecurityView;
