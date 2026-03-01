import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, Eye, EyeOff, Save, Check, AlertCircle, Shield, Camera, Trash2, AlertTriangle, Download } from 'lucide-react';
import { updateProfile, changePassword, setup2FA, verify2FA, disable2FA, deleteAccount, exportMyData } from '../../services/api';
import AccountLayout from '../../components/customer/AccountLayout';

const Profile = () => {
  const navigate = useNavigate();
  const userData = localStorage.getItem('shopCoreUser');
  const user = userData ? JSON.parse(userData) : null;

  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [passData, setPassData] = useState({ current: '', new: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState('');
  const [passMessage, setPassMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(user?.two_factor_enabled || false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const updated = await updateProfile(user?.id, form);
      const saved = { ...user, ...updated };
      localStorage.setItem('shopCoreUser', JSON.stringify(saved));
      setMessage('Profile updated successfully');
    } catch (err) {
      setMessage(err.message || 'Failed to update profile');
    } finally { setLoading(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passData.new !== passData.confirm) { setPassMessage('Passwords do not match'); return; }
    setPassLoading(true);
    setPassMessage('');
    try {
      await changePassword(passData.current, passData.new);
      setPassMessage('Password changed successfully');
      setPassData({ current: '', new: '', confirm: '' });
    } catch (err) {
      setPassMessage(err.message || 'Failed to change password');
    } finally { setPassLoading(false); }
  };

  const handle2FASetup = async () => {
    try {
      const data = await setup2FA();
      setTwoFASetup(data);
    } catch {}
  };

  const handle2FAVerify = async () => {
    try {
      await verify2FA(totpCode);
      setTwoFAEnabled(true);
      setTwoFASetup(null);
      setTotpCode('');
      const saved = { ...user, two_factor_enabled: true };
      localStorage.setItem('shopCoreUser', JSON.stringify(saved));
    } catch {}
  };

  const handle2FADisable = async () => {
    const password = window.prompt('Enter your password to disable 2FA:');
    if (!password) return;
    try {
      await disable2FA(password);
      setTwoFAEnabled(false);
      const saved = { ...user, two_factor_enabled: false };
      localStorage.setItem('shopCoreUser', JSON.stringify(saved));
    } catch {}
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteAccount();
      localStorage.removeItem('shopCoreUser');
      localStorage.removeItem('shopCoreToken');
      window.location.href = '/#/login';
      window.location.reload();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `10thwest-my-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message || 'Failed to export data');
      setTimeout(() => setExportError(''), 5000);
    } finally {
      setExportLoading(false);
    }
  };

  if (!user) return null;

  return (
    <AccountLayout>
      <div className="space-y-6">
        {/* Profile Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-6 flex items-center gap-2"><User size={20} /> Personal Information</h2>
          
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-2xl font-bold font-display relative">
              {user.name.charAt(0).toUpperCase()}
              <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                <Camera size={12} />
              </button>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">Role: {user.role}</p>
            </div>
          </div>

          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${message.includes('success') ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-orange-50 text-orange-500 border border-orange-200'}`}>
              {message.includes('success') ? <Check size={16} /> : <AlertCircle size={16} />} {message}
            </div>
          )}

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
              Save Changes
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-6 flex items-center gap-2"><Lock size={20} /> Change Password</h2>
          {passMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${passMessage.includes('success') ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-orange-50 text-orange-500 border border-orange-200'}`}>
              {passMessage.includes('success') ? <Check size={16} /> : <AlertCircle size={16} />} {passMessage}
            </div>
          )}
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <div className="relative">
                <input type={showPasswords ? 'text' : 'password'} value={passData.current} onChange={e => setPassData(p => ({...p, current: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 pr-10" />
                <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type={showPasswords ? 'text' : 'password'} value={passData.new} onChange={e => setPassData(p => ({...p, new: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input type="password" value={passData.confirm} onChange={e => setPassData(p => ({...p, confirm: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
            <button type="submit" disabled={passLoading}
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors">
              {passLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Two-Factor Auth */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2"><Shield size={20} /> Two-Factor Authentication</h2>
          {twoFAEnabled ? (
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Check size={20} className="text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700">2FA is enabled</p>
                  <p className="text-xs text-green-600">Your account is protected with two-factor authentication.</p>
                </div>
              </div>
              <button onClick={handle2FADisable} className="px-4 py-2 text-sm text-orange-500 hover:bg-orange-50 border border-orange-200 rounded-lg transition-colors">Disable</button>
            </div>
          ) : twoFASetup ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Scan the QR code below with your authenticator app, then enter the verification code.</p>
              <div className="flex justify-center p-4 bg-gray-50 rounded-lg">
                <img src={twoFASetup.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-gray-500 text-center">Secret: <code className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{twoFASetup.secret}</code></p>
              <div className="flex gap-2">
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000"
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <button onClick={handle2FAVerify} disabled={totpCode.length !== 6}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors">Verify</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">2FA is disabled</p>
                <p className="text-xs text-gray-500">Add an extra layer of security to your account.</p>
              </div>
              <button onClick={handle2FASetup} className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">Enable 2FA</button>
            </div>
          )}
        </div>

        {/* Data Portability - RA 10173 §18 (Right to Data Portability) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2"><Download size={20} /> Download My Data</h2>
          <p className="text-sm text-gray-600 mb-3">
            Under the Data Privacy Act of 2012 (RA 10173 §18), you have the right to obtain a copy of your personal data in a portable format.
          </p>
          <ul className="text-xs text-gray-500 mb-4 space-y-1 list-disc pl-4">
            <li>Includes your profile information, order history, saved addresses, and activity logs</li>
            <li>Downloaded as a JSON file you can save or transfer</li>
          </ul>
          <button onClick={handleExportData} disabled={exportLoading}
            className="px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            {exportLoading ? <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" /> : <Download size={14} />}
            {exportLoading ? 'Preparing...' : 'Download My Data'}
          </button>
          {exportError && (
            <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
              <AlertCircle size={14} /> {exportError}
            </div>
          )}
        </div>

        {/* Delete Account - Right to be Forgotten (RA 10173 §18) */}
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h2 className="font-display font-semibold text-lg text-red-600 mb-4 flex items-center gap-2"><Trash2 size={20} /> Delete My Account</h2>
          <p className="text-sm text-gray-600 mb-3">
            Under the Data Privacy Act of 2012 (RA 10173 §18), you have the right to request deletion of your personal data.
            This action will permanently anonymize your account and cannot be undone.
          </p>
          <ul className="text-xs text-gray-500 mb-4 space-y-1 list-disc pl-4">
            <li>Your personal information (name, email, phone) will be anonymized</li>
            <li>Order history and transaction records will be retained for tax compliance (BIR requirement)</li>
            <li>Active orders in progress will be completed before data removal</li>
          </ul>
          <button onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-300 rounded-lg transition-colors flex items-center gap-2">
            <Trash2 size={14} /> Request Account Deletion
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-display font-bold text-lg text-gray-900">Delete Your Account?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove your personal data. Transaction records will be retained per BIR regulations.
              This action <strong>cannot be undone</strong>.
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
                <AlertCircle size={16} /> {deleteError}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Type <strong>DELETE</strong> to confirm:</label>
              <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="DELETE" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteError(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2">
                {deleteLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountLayout>
  );
};

export default Profile;
