import React, { useEffect, useState } from 'react';
import {
  getStaffList, getStaffById, addStaff, editStaff, toggleStaffStatus, deleteStaff,
  getStaffActivity, updateStaffPermissions, getAllPermissions, getStaffPerformance,
  getActivityLogs, adminLockUser, adminUnlockUser, adminResetUserPassword,
} from '../../services/api';
import {
  Loader2, Plus, Pencil, Trash2, X, Save, Search, Shield, ShieldOff,
  UserPlus, Eye, Activity, Lock, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  UserCheck, UserX, Clock, FileText, BarChart3, Unlock, Key, AlertTriangle,
} from 'lucide-react';

const StaffManagement = () => {
  const [view, setView] = useState('list');
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [allPermissions, setAllPermissions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', phone: '' });

  // Global activity log state
  const [globalLogs, setGlobalLogs] = useState([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Lock/Unlock & Password Reset state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => { loadStaff(); }, [search, filterRole, filterStatus]);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const res = await getStaffList({ search, role: filterRole, status: filterStatus });
      setStaff(res.staff);
    } catch { setError('Failed to load staff'); }
    setLoading(false);
  };

  const loadPermissions = async () => {
    try { setAllPermissions(await getAllPermissions()); } catch {}
  };

  const openDetail = async (id) => {
    setLoading(true);
    try {
      const s = await getStaffById(id);
      setSelected(s);
      await loadPermissions();
      const perf = await getStaffPerformance(id);
      setPerformance(perf);
      setView('detail');
    } catch { setError('Failed to load staff details'); }
    setLoading(false);
  };

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', role: 'cashier', phone: '' });
    setView('add');
  };

  const openEdit = (s) => {
    setForm({ name: s.name, email: s.email, password: '', role: s.role, phone: s.phone || '' });
    setSelected(s);
    setView('edit');
  };

  const openLogs = async () => {
    setLoading(true);
    try {
      const res = await getActivityLogs({ page: 1, limit: 50 });
      setGlobalLogs(res.logs);
      setLogTotal(res.total);
      setLogPage(1);
      setView('logs');
    } catch { setError('Failed to load logs'); }
    setLoading(false);
  };

  const loadMoreLogs = async () => {
    const next = logPage + 1;
    const res = await getActivityLogs({ page: next, limit: 50 });
    setGlobalLogs([...globalLogs, ...res.logs]);
    setLogPage(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (view === 'add') {
        await addStaff(form);
        setSuccess('Staff member added!');
      } else if (view === 'edit' && selected) {
        await editStaff(selected.id, form);
        setSuccess('Staff member updated!');
      }
      setView('list');
      loadStaff();
    } catch (err) {
      setError(err.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleToggle = async (id) => {
    try {
      await toggleStaffStatus(id);
      loadStaff();
      if (selected?.id === id) {
        const s = await getStaffById(id);
        setSelected(s);
      }
    } catch (err) { setError(err.message); }
  };

  const handleDelete = (staffMember) => {
    setDeleteTarget(staffMember);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStaff(deleteTarget.id);
      setSuccess('Staff member deleted');
      setDeleteTarget(null);
      setView('list');
      loadStaff();
    } catch (err) { setError(err.message); setDeleteTarget(null); }
  };

  const handlePermissionChange = async (permId, granted) => {
    if (!selected) return;
    const perms = (selected.permissions || []).map(p =>
      p.id === permId ? { ...p, granted } : p
    );
    setSelected({ ...selected, permissions: perms });
    try {
      await updateStaffPermissions(selected.id, perms.map(p => ({ permission_id: p.id, granted: p.granted ?? true })));
    } catch { setError('Failed to update permissions'); }
  };

  const handleLockUnlock = async (id, isLocked) => {
    try {
      if (isLocked) {
        await adminUnlockUser(id);
        setSuccess('User account unlocked');
      } else {
        await adminLockUser(id);
        setSuccess('User account locked');
      }
      // Refresh the selected user and list
      const updated = await getStaffById(id);
      setSelected(updated);
      const list = await getStaffList({ search, role: filterRole, status: filterStatus });
      setStaff(Array.isArray(list) ? list : list.staff || []);
    } catch (err) {
      setError(err.message || 'Failed to update lock status');
    }
  };

  const handleResetPassword = async () => {
    if (resetPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (resetPassword !== resetConfirm) { setError('Passwords do not match'); return; }
    setResetting(true);
    try {
      await adminResetUserPassword(selected.id, resetPassword);
      setSuccess('Password reset successfully');
      setShowResetModal(false);
      setResetPassword('');
      setResetConfirm('');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    }
    setResetting(false);
  };

  // Clear messages after 3 seconds
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 3000); return () => clearTimeout(t); }
  }, [success]);

  // ─── FORM VIEW ───────────────────────────────────────────────────
  if (view === 'add' || view === 'edit') {
    return (
      <div className="bg-white rounded-xl shadow p-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">{view === 'add' ? 'Add Staff Member' : 'Edit Staff Member'}</h2>
          <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input type="text" required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password {view === 'edit' && <span className="text-slate-400">(leave blank to keep current)</span>}</label>
            <input type="password" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} {...(view === 'add' ? { required: true, minLength: 8 } : {})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
              <option value="store_staff">Store Staff</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>

        {error && <div className="mt-4 p-3 rounded-lg bg-orange-50 text-orange-500 text-sm">{error}</div>}

        <div className="mt-6 flex gap-3">
          <button onClick={() => setView('list')} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {view === 'add' ? 'Add Staff' : 'Update Staff'}
          </button>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ─────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const grouped = (selected.permissions || []).reduce((acc, p) => {
      const cat = p.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => { setView('list'); setSelected(null); }} className="text-sm text-orange-600 font-medium hover:text-orange-500">&larr; Back to Staff</button>
          <div className="flex gap-2">
            <button onClick={() => openEdit(selected)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</button>
            <button onClick={() => handleDelete(selected.id)} className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white text-xl font-bold">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selected.is_active ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                  {selected.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 capitalize">{selected.role}</span>
              </div>
              <p className="text-slate-500 text-sm">{selected.email}</p>
              {selected.phone && <p className="text-slate-500 text-sm">{selected.phone}</p>}
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                <span>Joined: {new Date(selected.created_at).toLocaleDateString()}</span>
                {selected.last_login && <span>Last login: {new Date(selected.last_login).toLocaleString()}</span>}
                {selected.two_factor_enabled && <span className="text-green-600 flex items-center gap-1"><Shield className="h-3 w-3" /> 2FA Enabled</span>}
              </div>
            </div>
            <button onClick={() => handleToggle(selected.id)} className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${selected.is_active ? 'bg-orange-50 text-orange-500 hover:bg-orange-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
              {selected.is_active ? <><UserX className="h-4 w-4" /> Deactivate</> : <><UserCheck className="h-4 w-4" /> Activate</>}
            </button>
            <button onClick={() => handleLockUnlock(selected.id, selected.locked_until && new Date(selected.locked_until) > new Date())}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                selected.locked_until && new Date(selected.locked_until) > new Date()
                  ? 'bg-green-50 text-green-600 hover:bg-green-100'
                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              }`}>
              {selected.locked_until && new Date(selected.locked_until) > new Date() ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock</>}
            </button>
            <button onClick={() => setShowResetModal(true)}
              className="px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg text-sm font-medium flex items-center gap-1">
              <Key size={14} /> Reset Password
            </button>
          </div>
        </div>

        {/* Performance */}
        {performance && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-500" /> Performance (Last {performance.period} Days)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{performance.orders.totalOrders}</p>
                <p className="text-xs text-slate-500">Orders Processed</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">₱{performance.orders.totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Revenue</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{performance.logins}</p>
                <p className="text-xs text-slate-500">Logins</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{performance.returnsProcessed}</p>
                <p className="text-xs text-slate-500">Returns Handled</p>
              </div>
            </div>
            {performance.topActions.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 mb-2">Top Actions</p>
                <div className="flex flex-wrap gap-2">
                  {performance.topActions.map(a => (
                    <span key={a.action} className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">{a.action} ({a.count})</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Permissions */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Lock className="h-5 w-5 text-orange-500" /> Permissions</h3>
          {Object.entries(grouped).map(([cat, perms]) => (
            <div key={cat} className="mb-4">
              <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-2">{cat}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {perms.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={p.granted !== false}
                      onChange={e => handlePermissionChange(p.id, e.target.checked)}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <p className="text-sm text-slate-700">{p.description || p.name}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Password Reset Modal */}
        {showResetModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reset Password for {selected?.name}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">New Password</label>
                  <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Min 8 characters" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Confirm Password</label>
                  <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Re-enter password" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => { setShowResetModal(false); setResetPassword(''); setResetConfirm(''); }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
                <button onClick={handleResetPassword} disabled={resetting}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ACTIVITY LOGS VIEW ──────────────────────────────────────────
  if (view === 'logs') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('list')} className="text-sm text-orange-600 font-medium hover:text-orange-500">&larr; Back to Staff</button>
          <span className="text-sm text-slate-500">{logTotal} total log entries</span>
        </div>
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">IP</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {globalLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{log.user_name || log.user_email || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono">{log.action}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400 font-mono">{log.ip_address || '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {globalLogs.length < logTotal && (
          <div className="text-center">
            <button onClick={loadMoreLogs} className="px-4 py-2 text-sm text-orange-600 hover:text-orange-500 font-medium">Load More</button>
          </div>
        )}
      </div>
    );
  }

  // ─── LIST VIEW ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {success && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm font-medium flex items-center gap-2">
          <UserCheck className="h-4 w-4" /> {success}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-orange-50 text-orange-500 text-sm font-medium">{error}</div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search staff..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
          <option value="store_staff">Store Staff</option>
          <option value="cashier">Cashier</option>
        </select>
        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={openLogs} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm flex items-center gap-1">
          <Activity className="h-4 w-4" /> Activity Logs
        </button>
        <button onClick={openAdd} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm flex items-center gap-1">
          <UserPlus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      {/* Staff Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 text-orange-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Staff Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Last Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} capitalize`}>{s.role}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {s.locked_until && new Date(s.locked_until) > new Date() && (
                      <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">Locked</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {s.last_activity ? new Date(s.last_activity).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{s.action_count || 0}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openDetail(s.id)} className="p-1.5 text-slate-400 hover:text-orange-500" title="View Details"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-blue-500" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleToggle(s.id)} className="p-1.5 text-slate-400 hover:text-amber-500" title={s.is_active ? 'Deactivate' : 'Activate'}>
                        {s.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-orange-400" />}
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 text-slate-400 hover:text-orange-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No staff members found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Staff Member</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">Are you sure you want to permanently delete:</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-4">
              <p className="text-sm font-semibold text-gray-900">{deleteTarget.name}</p>
              <p className="text-xs text-gray-400">{deleteTarget.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">{deleteTarget.role}</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
