import React, { useEffect, useRef, useState } from 'react';
import { User, Mail, Phone, Lock, Eye, EyeOff, Save, Check, AlertCircle, Shield, Camera, Trash2, AlertTriangle, Download } from 'lucide-react';
import { updateProfile, uploadProfileAvatar, changePassword, setup2FA, verify2FA, disable2FA, deleteAccount, exportMyData } from '../../services/api';
import AccountLayout from '../../components/customer/AccountLayout';

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PROFILE_EMAIL_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const PROFILE_PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

const normalizePhoneInput = (value) => String(value || '').trim().replace(/[\s()-]/g, '');

const Profile = () => {
  const userData = localStorage.getItem('shopCoreUser');
  const user = userData ? JSON.parse(userData) : null;

  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [passData, setPassData] = useState({ current: '', new: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [passMessage, setPassMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [passLoading, setPassLoading] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(user?.two_factor_enabled || false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [avatarError, setAvatarError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(user?.avatar || '');
    }
  }, [user?.avatar, avatarFile]);

  useEffect(() => () => {
    if (avatarPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
  }, [avatarPreview]);

  const validateProfileForm = () => {
    const nextErrors = {};
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim().toLowerCase();
    const rawPhone = form.phone.trim();
    const normalizedPhone = normalizePhoneInput(rawPhone);

    if (!trimmedName) {
      nextErrors.name = 'Name is required.';
    } else if (trimmedName.length < 2) {
      nextErrors.name = 'Name must be at least 2 characters.';
    } else if (trimmedName.length > 100) {
      nextErrors.name = 'Name must be 100 characters or fewer.';
    }

    if (!trimmedEmail) {
      nextErrors.email = 'Email is required.';
    } else if (!PROFILE_EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (rawPhone) {
      if (normalizedPhone.length > 13) {
        nextErrors.phone = 'Phone number must not exceed 13 characters.';
      } else if (!PROFILE_PHONE_REGEX.test(normalizedPhone)) {
        nextErrors.phone = 'Enter a valid phone number (09XXXXXXXXX or +639XXXXXXXXX).';
      }
    }

    return {
      nextErrors,
      sanitized: {
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone,
      },
    };
  };

  const resetAvatarInput = () => {
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    setAvatarError('');

    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarFile(null);
      resetAvatarInput();
      setAvatarError('Use a JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarFile(null);
      resetAvatarInput();
      setAvatarError('Image must be 2 MB or smaller.');
      return;
    }

    if (avatarPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const clearPendingAvatar = () => {
    if (avatarPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview(user?.avatar || '');
    setAvatarError('');
    resetAvatarInput();
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();

    const sanitizedInput = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: normalizePhoneInput(form.phone),
    };
    const currentProfile = {
      name: String(user?.name || '').trim(),
      email: String(user?.email || '').trim().toLowerCase(),
      phone: normalizePhoneInput(user?.phone || ''),
    };
    const hasProfileChanges = (
      sanitizedInput.name !== currentProfile.name ||
      sanitizedInput.email !== currentProfile.email ||
      sanitizedInput.phone !== currentProfile.phone
    );
    const hasAvatarChange = Boolean(avatarFile);

    setFieldErrors({});
    setMessage('');
    setMessageType('');
    setAvatarError('');

    if (!hasProfileChanges && !hasAvatarChange) {
      setMessageType('success');
      setMessage('No changes to save.');
      return;
    }

    if (hasAvatarChange && !hasProfileChanges) {
      setLoading(true);
      setAvatarUploading(true);
      try {
        const avatarUrl = await uploadProfileAvatar(avatarFile);
        const saved = { ...user, avatar: avatarUrl };
        localStorage.setItem('shopCoreUser', JSON.stringify(saved));
        window.dispatchEvent(new Event('auth:changed'));
        setAvatarFile(null);
        setAvatarPreview(avatarUrl || '');
        resetAvatarInput();
        setMessageType('success');
        setMessage('Profile picture updated successfully.');
      } catch (err) {
        setAvatarError(err.message || 'Failed to upload profile picture.');
        setMessageType('error');
        setMessage(err.message || 'Failed to update profile picture.');
      } finally {
        setAvatarUploading(false);
        setLoading(false);
      }
      return;
    }

    const { nextErrors, sanitized } = validateProfileForm();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessageType('error');
      setMessage('Please correct the highlighted fields.');
      return;
    }

    setLoading(true);
    try {
      let avatarUrl = user?.avatar || null;
      if (avatarFile) {
        setAvatarUploading(true);
        avatarUrl = await uploadProfileAvatar(avatarFile);
      }

      const profileUpdateResult = await updateProfile(user?.id, { ...sanitized, avatar: avatarUrl });
      const updated = profileUpdateResult?.user || {};
      const saved = { ...user, ...updated };
      localStorage.setItem('shopCoreUser', JSON.stringify(saved));
      window.dispatchEvent(new Event('auth:changed'));
      setForm({
        name: updated.name || '',
        email: updated.email || '',
        phone: updated.phone || '',
      });
      setAvatarFile(null);
      setAvatarPreview(updated.avatar || '');
      resetAvatarInput();
      setFieldErrors({});
      setMessageType('success');

      if (profileUpdateResult?.requiresEmailVerification) {
        const pendingEmail = profileUpdateResult?.pending_email || sanitized.email;
        setMessage(profileUpdateResult?.message || `Profile updated. Please verify your new email address (${pendingEmail}) to complete the change.`);
      } else {
        setMessage(profileUpdateResult?.message || 'Profile updated successfully.');
      }
    } catch (err) {
      setFieldErrors(err.fieldErrors || {});
      if ((err.message || '').toLowerCase().includes('profile picture') || (err.message || '').toLowerCase().includes('image')) {
        setAvatarError(err.message || 'Failed to upload profile picture.');
      }
      setMessageType('error');
      setMessage(err.message || 'Failed to update profile.');
    } finally {
      setAvatarUploading(false);
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passData.current || !passData.new || !passData.confirm) {
      setPassMessage('Current password, new password, and confirmation are required.');
      return;
    }

    if (!STRONG_PASSWORD_REGEX.test(passData.new)) {
      setPassMessage('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
      return;
    }

    if (passData.new !== passData.confirm) {
      setPassMessage('Passwords do not match');
      return;
    }

    if (passData.new === passData.current) {
      setPassMessage('New password must be different from your current password.');
      return;
    }

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
    if (!deletePassword) {
      setDeleteError('Password is required to confirm account deletion');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
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
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-6 flex items-center gap-2"><User size={20} className="text-red-500" /> Personal Information</h2>

          <div className="flex items-start gap-4 mb-6 pb-6 border-b border-slate-200">
            <div className="relative shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover border border-slate-200 bg-gray-100"
                />
              ) : (
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-2xl font-bold font-display">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors duration-500"
                aria-label="Upload profile picture"
              >
                <Camera size={12} />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, or WEBP up to 2 MB.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors duration-500"
                >
                  {avatarFile ? 'Choose Different Image' : 'Upload Image'}
                </button>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={clearPendingAvatar}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-slate-300 hover:bg-gray-100 rounded-lg transition-colors duration-500"
                  >
                    Cancel Preview
                  </button>
                )}
              </div>
              {avatarFile && <p className="text-xs text-amber-600 mt-2">Preview ready. Save changes to apply this profile picture.</p>}
              {avatarError && <p className="text-xs text-red-500 mt-2">{avatarError}</p>}
            </div>
          </div>

          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${messageType === 'success' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-500/10 text-red-500 border border-red-200'}`}>
              {messageType === 'success' ? <Check size={16} /> : <AlertCircle size={16} />} {message}
            </div>
          )}

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <User size={16} />
                  </span>
                  <input
                    id="profile-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, name: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    className={`w-full bg-white text-gray-900 pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${fieldErrors.name ? 'border-red-400' : 'border-slate-300'}`}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </div>
                {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <Mail size={16} />
                  </span>
                  <input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, email: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    className={`w-full bg-white text-gray-900 pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${fieldErrors.email ? 'border-red-400' : 'border-slate-300'}`}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <Phone size={16} />
                </span>
                <input
                  id="profile-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, phone: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  className={`w-full bg-white text-gray-900 pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${fieldErrors.phone ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="+63 912 345 6789"
                  autoComplete="tel"
                  maxLength={16}
                />
              </div>
              {fieldErrors.phone && <p className="mt-1 text-xs text-red-500">{fieldErrors.phone}</p>}
              {!fieldErrors.phone && <p className="mt-1 text-xs text-gray-500">Accepted format: 09XXXXXXXXX or +639XXXXXXXXX</p>}
            </div>
            <button
              type="submit"
              disabled={loading || avatarUploading}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors duration-500 flex items-center gap-2"
            >
              {loading || avatarUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
              {avatarUploading ? 'Uploading Image...' : loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-6 flex items-center gap-2"><Lock size={20} className="text-red-500" /> Change Password</h2>
          {passMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${passMessage.includes('success') ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-500/10 text-red-500 border border-red-200'}`}>
              {passMessage.includes('success') ? <Check size={16} /> : <AlertCircle size={16} />} {passMessage}
            </div>
          )}
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <div className="relative">
                <input type={showPasswords ? 'text' : 'password'} value={passData.current} onChange={e => setPassData(p => ({ ...p, current: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 pr-10" />
                <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type={showPasswords ? 'text' : 'password'} value={passData.new} onChange={e => setPassData(p => ({ ...p, new: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                <p className="mt-1 text-xs text-gray-500">Use at least 8 characters with uppercase, lowercase, number, and special character.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input type="password" value={passData.confirm} onChange={e => setPassData(p => ({ ...p, confirm: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
            </div>
            <button type="submit" disabled={passLoading}
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors duration-500">
              {passLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2"><Shield size={20} className="text-red-500" /> Two-Factor Authentication</h2>
          {twoFAEnabled ? (
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Check size={20} className="text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700">2FA is enabled</p>
                  <p className="text-xs text-green-600">Your account is protected with two-factor authentication.</p>
                </div>
              </div>
              <button onClick={handle2FADisable} className="px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 border border-red-200 rounded-lg transition-colors duration-500">Disable</button>
            </div>
          ) : twoFASetup ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Scan the QR code below with your authenticator app, then enter the verification code.</p>
              <div className="flex justify-center p-4 bg-gray-100 rounded-lg">
                <img src={twoFASetup.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              <div className="flex gap-2">
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000"
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-center tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-red-500" />
                <button onClick={handle2FAVerify} disabled={totpCode.length !== 6}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors duration-500">Verify</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">2FA is disabled</p>
                <p className="text-xs text-gray-400">Add an extra layer of security to your account.</p>
              </div>
              <button onClick={handle2FASetup} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-300 ease-in-out">Enable 2FA</button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2"><Download size={20} className="text-red-500" /> Download My Data</h2>
          <p className="text-sm text-gray-600 mb-3">
            Under the Data Privacy Act of 2012 (RA 10173 Ã‚Â§18), you have the right to obtain a copy of your personal data in a portable format.
          </p>
          <ul className="text-xs text-gray-400 mb-4 space-y-1 list-disc pl-4">
            <li>Includes your profile information, order history, saved addresses, and activity logs</li>
            <li>Downloaded as a JSON file you can save or transfer</li>
          </ul>
          <button onClick={handleExportData} disabled={exportLoading}
            className="px-4 py-2 text-sm text-orange-600 hover:bg-red-500/10 border border-red-300 rounded-lg transition-all duration-300 ease-in-out flex items-center gap-2 disabled:opacity-50">
            {exportLoading ? <div className="w-4 h-4 border-2 border-red-300 border-t-orange-600 rounded-full animate-spin" /> : <Download size={14} />}
            {exportLoading ? 'Preparing...' : 'Download My Data'}
          </button>
          {exportError && (
            <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
              <AlertCircle size={14} /> {exportError}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
          <h2 className="font-display font-semibold text-lg text-red-600 mb-4 flex items-center gap-2"><Trash2 size={20} /> Delete My Account</h2>
          <p className="text-sm text-gray-600 mb-3">
            Under the Data Privacy Act of 2012 (RA 10173 Ã‚Â§18), you have the right to request deletion of your personal data.
            This action will permanently anonymize your account and cannot be undone.
          </p>
          <ul className="text-xs text-gray-400 mb-4 space-y-1 list-disc pl-4">
            <li>Your personal information (name, email, phone) will be anonymized</li>
            <li>Order history and transaction records will be retained for tax compliance (BIR requirement)</li>
            <li>Active orders in progress will be completed before data removal</li>
          </ul>
          <button onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-300 rounded-lg transition-all duration-300 ease-in-out flex items-center gap-2">
            <Trash2 size={14} /> Request Account Deletion
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/20 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-scaleIn">
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="DELETE" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter your password:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Current password"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setDeletePassword(''); setDeleteError(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-300 ease-in-out">
                Cancel
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || !deletePassword || deleteLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center gap-2">
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



