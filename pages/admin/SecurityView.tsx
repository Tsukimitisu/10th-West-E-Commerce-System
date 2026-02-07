import React, { useEffect, useState } from 'react';
import { getAllPermissions, getActivityLogs } from '../../services/api';
import { Shield, Search, Lock, Eye, UserCog, Clock, AlertTriangle, CheckCircle2, XCircle, Key, Globe, Activity } from 'lucide-react';
import { Permission, ActivityLog } from '../../types';

const SecurityView: React.FC = () => {
  const [tab, setTab] = useState<'roles' | 'permissions' | 'logs'>('roles');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLogs, setSearchLogs] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [perms, logs] = await Promise.all([
          getAllPermissions().catch(() => []),
          getActivityLogs().catch(() => []),
        ]);
        setPermissions(Array.isArray(perms) ? perms : []);
        setActivityLogs(Array.isArray(logs) ? logs : []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const roles = [
    { name: 'Admin', color: 'bg-red-50 text-red-700 border-red-200', desc: 'Full system access', permsCount: 'All' },
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

  const rolePerms: Record<string, string[]> = {
    Admin: permissionGroups.flatMap(g => g.perms),
    Manager: ['products.view', 'products.create', 'products.edit', 'orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.refund', 'inventory.view', 'inventory.adjust', 'reports.view', 'reports.export', 'staff.view', 'pos.access', 'pos.discount', 'returns.view', 'returns.approve', 'returns.refund'],
    Cashier: ['products.view', 'orders.view', 'orders.create', 'inventory.view', 'pos.access', 'pos.discount', 'returns.view', 'returns.approve'],
    Viewer: ['products.view', 'orders.view', 'reports.view'],
  };

  const filteredLogs = activityLogs.filter(l => {
    const term = searchLogs.toLowerCase();
    return !term || (l as any).action?.toLowerCase().includes(term) || (l as any).user_name?.toLowerCase().includes(term) || (l as any).details?.toLowerCase().includes(term);
  });

  const tabs = [
    { id: 'roles', label: 'Roles', icon: UserCog },
    { id: 'permissions', label: 'Permissions Matrix', icon: Key },
    { id: 'logs', label: 'Activity Logs', icon: Activity },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-gray-900">Security & Roles</h1>
        <p className="text-sm text-gray-500">Role-based access control and activity monitoring</p>
      </div>

      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
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
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filteredLogs.length === 0 ? (
                  <div className="p-12 text-center"><Activity size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">No activity logs found</p></div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {filteredLogs.slice(0, 100).map((log, i) => {
                      const action = (log as any).action || '';
                      const isLogin = action.toLowerCase().includes('login');
                      const isFailed = action.toLowerCase().includes('fail');
                      return (
                        <div key={i} className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isFailed ? 'bg-red-50' : isLogin ? 'bg-green-50' : 'bg-blue-50'}`}>
                            {isFailed ? <AlertTriangle size={14} className="text-red-500" /> : isLogin ? <Globe size={14} className="text-green-500" /> : <Activity size={14} className="text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{(log as any).user_name || `User #${(log as any).user_id || '?'}`}</span>
                              <span className="text-gray-500"> — {action}</span>
                            </p>
                            {(log as any).details && <p className="text-xs text-gray-400 mt-0.5 truncate">{(log as any).details}</p>}
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                              <span className="flex items-center gap-0.5"><Clock size={9} /> {new Date((log as any).created_at || (log as any).timestamp).toLocaleString()}</span>
                              {(log as any).ip_address && <span className="flex items-center gap-0.5"><Globe size={9} /> {(log as any).ip_address}</span>}
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
        </>
      )}
    </div>
  );
};

export default SecurityView;
