import React, { useEffect, useState } from 'react';
import {
  Users, Search, Plus, Lock, Unlock, Key, Shield, UserCog,
  ChevronDown, ChevronUp, MoreVertical, AlertTriangle, CheckCircle2,
  XCircle, Eye, Edit3, Trash2, Loader2, RefreshCw, X, Mail, Phone
} from 'lucide-react';
import {
  adminGetAllUsers, adminLockUser, adminUnlockUser,
  adminResetUserPassword, adminUpdateUserRole,
  addStaff, editStaff, adminDeleteUser
} from '../../services/api';
import { getCurrentAuthUser } from '../../services/authSession';
import PageHeader from '../../components/operations/PageHeader';
import Modal from '../../components/owner/Modal';
import { ConfirmationDialog } from '../../components/ui/BrandPrimitives';
import DataToolbar, { FilterSelect } from '../../components/operations/DataToolbar';
import ActionDropdown from '../../components/operations/ActionDropdown';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'owner', label: 'Owner', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'store_staff', label: 'Store Staff', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'customer', label: 'Customer', color: 'bg-slate-100 text-slate-700 border-slate-200' },
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
  const [showModal, setShowModal] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'store_staff', password: '' });
  const [resetPwForm, setResetPwForm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [roleChange, setRoleChange] = useState(null);

  const currentUser = getCurrentAuthUser() || {};

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
    setDeleteTarget(user);
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setActionLoading(`del-${deleteTarget.id}`);
    try {
      await adminDeleteUser(deleteTarget.id);
      showMessage('success', `${deleteTarget.name} deleted`);
      setDeleteTarget(null);
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
    const r = ROLES.find(r => r.value === role) || { label: role, color: 'bg-gray-100 text-gray-600 border-slate-200' };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.color}`}>{r.label}</span>;
  };

  const isLocked = (user) => user.locked_until && new Date(user.locked_until) > new Date();
  const userActions = (user) => [
    { label: 'View account', icon: Eye, onClick: () => openView(user) },
    { label: 'Edit user', icon: Edit3, onClick: () => openEdit(user) },
    { label: 'Reset password', icon: Key, onClick: () => openResetPw(user) },
    isLocked(user)
      ? { label: 'Unlock account', icon: Unlock, onClick: () => handleUnlock(user), disabled: actionLoading === `unlock-${user.id}` }
      : { label: 'Lock account', icon: Lock, onClick: () => handleLock(user), disabled: user.id === currentUser.id || actionLoading === `lock-${user.id}` },
    { label: 'Delete user', icon: Trash2, onClick: () => handleDeleteUser(user), disabled: user.id === currentUser.id || actionLoading === `del-${user.id}`, destructive: true },
  ];

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {message.text && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {message.text}
          </div>
        </div>
      )}

      <PageHeader
        title="Users & roles"
        description="Create and maintain accounts, role assignments, security state, and access recovery."
        actions={<button onClick={() => { setForm({ name: '', email: '', phone: '', role: 'store_staff', password: '' }); setShowModal('add'); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-700"><Plus size={16} /> Add user</button>}
      />

      <DataToolbar search={search} onSearchChange={event => { setSearch(event.target.value); setPage(1); }} searchPlaceholder="Search by name or email…" label="User directory filters" actions={<button type="button" onClick={loadUsers} aria-label="Refresh users" className="min-h-11 min-w-11 rounded-lg border border-slate-300 p-3"><RefreshCw size={16} aria-hidden="true" /></button>}>
        <FilterSelect label="Role" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1); }}><option value="">All roles</option>{ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</FilterSelect>
        <FilterSelect label="Status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="locked">Locked</option></FilterSelect>
      </DataToolbar>
      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-500 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div tabIndex={0} className="overflow-x-auto">
            <div className="divide-y divide-slate-200 md:hidden">
              {users.map((user) => <article key={user.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
                  <p className="break-all text-xs text-slate-600">{user.email}</p>
                  <div className="flex flex-wrap items-center gap-2">{getRoleBadge(user.role)}<span className={`text-xs font-medium ${isLocked(user) ? 'text-red-700' : user.is_active ? 'text-emerald-700' : 'text-slate-600'}`}>{isLocked(user) ? 'Locked' : user.is_active ? 'Active' : 'Inactive'}</span></div>
                  <p className="text-xs text-slate-600">Last login: {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'} · 2FA {user.two_factor_enabled ? 'on' : 'off'}</p>
                </div>
                <ActionDropdown label={`Actions for ${user.name}`} items={userActions(user)} />
              </article>)}
            </div>
            <table className="hidden w-full text-left md:table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">2FA</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 text-orange-800 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-950">{user.name}</p>
                          <p className="text-[11px] text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {isLocked(user) ? (
                        <span className="flex items-center gap-1 text-xs text-red-500"><Lock size={12} /> Locked</span>
                      ) : user.is_active ? (
                        <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 size={12} /> Active</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400"><XCircle size={12} /> Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {user.two_factor_enabled ? (
                        <span className="text-xs text-green-500 flex items-center gap-1"><Shield size={12} /> On</span>
                      ) : (
                        <span className="text-xs text-gray-400">Off</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ActionDropdown
                          label={`Actions for ${user.name}`}
                          items={userActions(user)}
                        />
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <span className="text-xs text-gray-400">{total} users total</span>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === i + 1 ? 'bg-orange-600 text-slate-950' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <Modal isOpen={Boolean(showModal)} onClose={() => setShowModal(null)} title={showModal === 'view' ? 'Account details' : showModal === 'add' ? 'Add user' : showModal === 'resetPw' ? 'Reset password' : 'Edit user'}>
          <div className="operations-content w-full">
            {/* View User */}
            {showModal === 'view' && selectedUser && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-950">User Details</h3>
                  <button aria-label="Close account dialog" onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
                    <div className="w-14 h-14 bg-orange-100 text-orange-800 rounded-full flex items-center justify-center text-xl font-bold">
                      {selectedUser.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-slate-950 font-semibold">{selectedUser.name}</h4>
                      <p className="text-sm text-gray-400">{selectedUser.email}</p>
                      <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-400 text-xs">Phone</span><p className="text-gray-700">{selectedUser.phone || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs">Status</span><p className={isLocked(selectedUser) ? 'text-red-500' : selectedUser.is_active ? 'text-green-500' : 'text-gray-400'}>{isLocked(selectedUser) ? 'Locked' : selectedUser.is_active ? 'Active' : 'Inactive'}</p></div>
                    <div><span className="text-gray-400 text-xs">2FA</span><p className={selectedUser.two_factor_enabled ? 'text-green-500' : 'text-gray-400'}>{selectedUser.two_factor_enabled ? 'Enabled' : 'Disabled'}</p></div>
                    <div><span className="text-gray-400 text-xs">Login Attempts</span><p className="text-gray-700">{selectedUser.login_attempts || 0}</p></div>
                    <div><span className="text-gray-400 text-xs">Last Login</span><p className="text-gray-700">{selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleString() : 'Never'}</p></div>
                    <div><span className="text-gray-400 text-xs">Created</span><p className="text-gray-700">{new Date(selectedUser.created_at).toLocaleString()}</p></div>
                  </div>
                  <div className="pt-4 border-t border-slate-200">
                    <label htmlFor="managed-role-change" className="text-xs text-gray-400 mb-1 block">Change Role</label>
                    <div className="flex gap-2">
                      <select id="managed-role-change" value={selectedUser.role} onChange={(e) => setRoleChange({ mode: 'role', userId: selectedUser.id, name: selectedUser.name, previous: selectedUser.role, role: e.target.value })}
                        disabled={selectedUser.id === currentUser.id || actionLoading === `role-${selectedUser.id}`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-50">
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      {actionLoading === `role-${selectedUser.id}` && <Loader2 size={18} className="text-red-500 animate-spin self-center" />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add / Edit User */}
            {(showModal === 'add' || showModal === 'edit') && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-950">{showModal === 'add' ? 'Add New User' : 'Edit User'}</h3>
                  <button aria-label="Close account dialog" onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="managed-user-name" className="text-xs text-gray-400 mb-1 block">Full Name *</label>
                    <input type="text" id="managed-user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                  </div>
                  <div>
                    <label htmlFor="managed-user-email" className="text-xs text-gray-400 mb-1 block">Email *</label>
                    <input type="email" id="managed-user-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@10thwest.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                  </div>
                  <div>
                    <label htmlFor="managed-user-phone" className="text-xs text-gray-400 mb-1 block">Phone</label>
                    <input type="text" id="managed-user-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="555-0001"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                  </div>
                  <div>
                    <label htmlFor="managed-user-role" className="text-xs text-gray-400 mb-1 block">Role</label>
                    <select id="managed-user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-orange-500/30">
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {showModal === 'add' && (
                    <div>
                      <label htmlFor="managed-user-password" className="text-xs text-gray-400 mb-1 block">Password *</label>
                      <input type="password" id="managed-user-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowModal(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors">Cancel</button>
                    <button onClick={showModal === 'add' ? handleAddUser : () => form.role !== selectedUser.role ? setRoleChange({ mode: 'edit', userId: selectedUser.id, name: selectedUser.name, previous: selectedUser.role, role: form.role }) : handleEditUser()}
                      disabled={actionLoading === 'add' || actionLoading === 'edit'}
                      className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-slate-950 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
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
                  <h3 className="text-lg font-bold text-slate-950">Reset Password</h3>
                  <button aria-label="Close account dialog" onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-sm text-gray-600">Resetting password for: <span className="text-slate-950 font-semibold">{selectedUser.name}</span></p>
                    <p className="text-xs text-gray-400">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label htmlFor="managed-reset-password" className="text-xs text-gray-400 mb-1 block">New Password *</label>
                      <div className="relative">
                        <input id="managed-reset-password" type={showResetPassword ? "text" : "password"} value={resetPwForm} onChange={(e) => setResetPwForm(e.target.value)} placeholder="Min 8 characters"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-950 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                        <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300">
                          {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                  </div>
                  <div className="bg-red-500/10 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-orange-600 flex items-center gap-1"><AlertTriangle size={12} /> This will log the user out of all sessions</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowModal(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
                    <button onClick={handleResetPassword} disabled={actionLoading === 'resetPw'}
                      className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-slate-950 text-sm font-medium rounded-xl flex items-center justify-center gap-2">
                      {actionLoading === 'resetPw' && <Loader2 size={14} className="animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <ConfirmationDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={confirmDeleteUser} title="Delete user?" description={`Permanently delete ${deleteTarget?.name || 'this account'}? This action cannot be undone.`} busy={actionLoading?.startsWith('del-')} confirmLabel={actionLoading?.startsWith('del-') ? 'Deleting…' : 'Delete user'} danger />
      <ConfirmationDialog isOpen={Boolean(roleChange)} onClose={() => setRoleChange(null)} onConfirm={async () => { if (!roleChange) return; const change = roleChange; setRoleChange(null); if (change.mode === 'edit') await handleEditUser(); else await handleChangeRole(change.userId, change.role); }} title="Confirm role change" description={`Change ${roleChange?.name || 'this user'} from ${String(roleChange?.previous || '').replaceAll('_', ' ')} to ${String(roleChange?.role || '').replaceAll('_', ' ')}? Their available tools and permissions will change.`} confirmLabel="Confirm role change" />
    </div>
  );
};

export default UserManagementView;


