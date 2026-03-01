import React, { useEffect, useState } from 'react';
import {
  Users, Search, Plus, Lock, Unlock, Key, Shield, UserCog,
  ChevronDown, ChevronUp, MoreVertical, AlertTriangle, CheckCircle2,
  XCircle, Eye, Edit3, Trash2, Loader2, RefreshCw, X, Mail, Phone
} from 'lucide-react';
import {
  adminGetAllUsers, adminLockUser, adminUnlockUser,
  adminResetUserPassword, adminUpdateUserRole,
  addStaff, editStaff, deleteStaff
} from '../../services/api';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: 'owner', label: 'Owner', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'store_staff', label: 'Store Staff', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'customer', label: 'Customer', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
];

const UserManagementView = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(null); // 'view' | 'add' | 'edit' | 'resetPw' | null
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form state
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'store_staff', password: '' });
  const [resetPwForm, setResetPwForm] = useState('');

  const currentUser = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await adminGetAllUsers({ search, role: roleFilter, status: statusFilter, page });
      setUsers(data?.users || []);
      setTotal(data?.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [search, roleFilter, statusFilter, page]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const handleLock = async (user) => {
    if (user.id === currentUser.id) return showMessage('error', 'Cannot lock your own account');
    setActionLoading(`lock-${user.id}`);
    try {
      await adminLockUser(user.id);
      showMessage('success', `${user.name} locked`);
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleUnlock = async (user) => {
    setActionLoading(`unlock-${user.id}`);
    try {
      await adminUnlockUser(user.id);
      showMessage('success', `${user.name} unlocked`);
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleResetPassword = async () => {
    if (!resetPwForm || resetPwForm.length < 8) return showMessage('error', 'Password must be at least 8 characters');
    setActionLoading('resetPw');
    try {
      await adminResetUserPassword(selectedUser.id, resetPwForm);
      showMessage('success', `Password reset for ${selectedUser.name}`);
      setShowModal(null);
      setResetPwForm('');
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleChangeRole = async (userId, newRole) => {
    setActionLoading(`role-${userId}`);
    try {
      await adminUpdateUserRole(userId, newRole);
      showMessage('success', 'Role updated');
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleAddUser = async () => {
    if (!form.name || !form.email || !form.password) return showMessage('error', 'Name, email, and password are required');
    setActionLoading('add');
    try {
      await addStaff({ name: form.name, email: form.email, phone: form.phone, role: form.role, password: form.password });
      showMessage('success', 'User created');
      setShowModal(null);
      setForm({ name: '', email: '', phone: '', role: 'store_staff', password: '' });
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleEditUser = async () => {
    if (!form.name || !form.email) return showMessage('error', 'Name and email are required');
    setActionLoading('edit');
    try {
      await editStaff(selectedUser.id, { name: form.name, email: form.email, phone: form.phone, role: form.role });
      showMessage('success', 'User updated');
      setShowModal(null);
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser.id) return showMessage('error', 'Cannot delete your own account');
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    setActionLoading(`del-${user.id}`);
    try {
      await deleteStaff(user.id);
      showMessage('success', `${user.name} deleted`);
      loadUsers();
    } catch (e) { showMessage('error', e.message); }
    setActionLoading('');
  };

  const openEdit = (user) => {
    setSelectedUser(user);
    setForm({ name: user.name, email: user.email, phone: user.phone || '', role: user.role, password: '' });
    setShowModal('edit');
  };

  const openResetPw = (user) => {
    setSelectedUser(user);
    setResetPwForm('');
    setShowModal('resetPw');
  };

  const openView = (user) => {
    setSelectedUser(user);
    setShowModal('view');
  };

  const getRoleBadge = (role) => {
    const r = ROLES.find(r => r.value === role) || { label: role, color: 'bg-gray-700 text-gray-300 border-gray-600' };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.color}`}>{r.label}</span>;
  };

  const isLocked = (user) => user.locked_until && new Date(user.locked_until) > new Date();

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {message.text && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${
          message.type === 'success' ? 'bg-green-900/80 text-green-300 border-green-700' : 'bg-red-900/80 text-red-300 border-red-700'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {message.text}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Users size={22} className="text-red-400" /> User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Create, edit, and manage all user accounts</p>
        </div>
        <button onClick={() => { setForm({ name: '', email: '', phone: '', role: 'store_staff', password: '' }); setShowModal('add'); }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50" />
        </div>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500/30">
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500/30">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
        <button onClick={loadUsers} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors"><RefreshCw size={16} /></button>
      </div>

      {/* Users Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-400 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">2FA</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-[11px] text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {isLocked(user) ? (
                        <span className="flex items-center gap-1 text-xs text-red-400"><Lock size={12} /> Locked</span>
                      ) : user.is_active ? (
                        <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} /> Active</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-500"><XCircle size={12} /> Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {user.two_factor_enabled ? (
                        <span className="text-xs text-green-400 flex items-center gap-1"><Shield size={12} /> On</span>
                      ) : (
                        <span className="text-xs text-gray-600">Off</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openView(user)} title="View" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"><Eye size={14} /></button>
                        <button onClick={() => openEdit(user)} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => openResetPw(user)} title="Reset Password" className="p-1.5 text-gray-500 hover:text-orange-400 hover:bg-gray-800 rounded-lg transition-colors"><Key size={14} /></button>
                        {isLocked(user) ? (
                          <button onClick={() => handleUnlock(user)} title="Unlock" disabled={actionLoading === `unlock-${user.id}`}
                            className="p-1.5 text-red-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50">
                            {actionLoading === `unlock-${user.id}` ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                          </button>
                        ) : (
                          <button onClick={() => handleLock(user)} title="Lock" disabled={user.id === currentUser.id || actionLoading === `lock-${user.id}`}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30">
                            {actionLoading === `lock-${user.id}` ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                          </button>
                        )}
                        <button onClick={() => handleDeleteUser(user)} title="Delete" disabled={user.id === currentUser.id || actionLoading === `del-${user.id}`}
                          className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30">
                          {actionLoading === `del-${user.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-xs text-gray-500">{total} users total</span>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === i + 1 ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto">
            {/* View User */}
            {showModal === 'view' && selectedUser && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white">User Details</h3>
                  <button onClick={() => setShowModal(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-800">
                    <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-xl font-bold text-gray-400">
                      {selectedUser.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">{selectedUser.name}</h4>
                      <p className="text-sm text-gray-400">{selectedUser.email}</p>
                      <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500 text-xs">Phone</span><p className="text-gray-300">{selectedUser.phone || 'N/A'}</p></div>
                    <div><span className="text-gray-500 text-xs">Status</span><p className={isLocked(selectedUser) ? 'text-red-400' : selectedUser.is_active ? 'text-green-400' : 'text-gray-500'}>{isLocked(selectedUser) ? 'Locked' : selectedUser.is_active ? 'Active' : 'Inactive'}</p></div>
                    <div><span className="text-gray-500 text-xs">2FA</span><p className={selectedUser.two_factor_enabled ? 'text-green-400' : 'text-gray-500'}>{selectedUser.two_factor_enabled ? 'Enabled' : 'Disabled'}</p></div>
                    <div><span className="text-gray-500 text-xs">Login Attempts</span><p className="text-gray-300">{selectedUser.login_attempts || 0}</p></div>
                    <div><span className="text-gray-500 text-xs">Last Login</span><p className="text-gray-300">{selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleString() : 'Never'}</p></div>
                    <div><span className="text-gray-500 text-xs">Created</span><p className="text-gray-300">{new Date(selectedUser.created_at).toLocaleString()}</p></div>
                  </div>
                  <div className="pt-4 border-t border-gray-800">
                    <label className="text-xs text-gray-500 mb-1 block">Change Role</label>
                    <div className="flex gap-2">
                      <select value={selectedUser.role} onChange={(e) => handleChangeRole(selectedUser.id, e.target.value)}
                        disabled={selectedUser.id === currentUser.id || actionLoading === `role-${selectedUser.id}`}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50">
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      {actionLoading === `role-${selectedUser.id}` && <Loader2 size={18} className="text-red-400 animate-spin self-center" />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add / Edit User */}
            {(showModal === 'add' || showModal === 'edit') && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white">{showModal === 'add' ? 'Add New User' : 'Edit User'}</h3>
                  <button onClick={() => setShowModal(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Full Name *</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Email *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@10thwest.com"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                    <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="555-0001"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Role</label>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30">
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {showModal === 'add' && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Password *</label>
                      <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowModal(null)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors">Cancel</button>
                    <button onClick={showModal === 'add' ? handleAddUser : handleEditUser}
                      disabled={actionLoading === 'add' || actionLoading === 'edit'}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
                      {(actionLoading === 'add' || actionLoading === 'edit') && <Loader2 size={14} className="animate-spin" />}
                      {showModal === 'add' ? 'Create User' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Password */}
            {showModal === 'resetPw' && selectedUser && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white">Reset Password</h3>
                  <button onClick={() => setShowModal(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <p className="text-sm text-gray-300">Resetting password for: <span className="text-white font-semibold">{selectedUser.name}</span></p>
                    <p className="text-xs text-gray-500">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">New Password *</label>
                    <input type="password" value={resetPwForm} onChange={(e) => setResetPwForm(e.target.value)} placeholder="Min 8 characters"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
                    <p className="text-xs text-orange-400 flex items-center gap-1"><AlertTriangle size={12} /> This will log the user out of all sessions</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowModal(null)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl">Cancel</button>
                    <button onClick={handleResetPassword} disabled={actionLoading === 'resetPw'}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
                      {actionLoading === 'resetPw' && <Loader2 size={14} className="animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
