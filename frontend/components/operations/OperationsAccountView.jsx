import { usePasswordPolicy } from '../../hooks/usePasswordPolicy.js';
import { passwordPolicyError, passwordRequirementsText } from '../../utils/passwordPolicy.js';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from './PageHeader';
import SectionCard from './SectionCard';
import BrandButton from '../ui/BrandButton';
import StatusBadge from '../ui/StatusBadge';
import { updateProfile, changePassword, setLocalPassword, getAuthAvailability, setup2FA, verify2FA, disable2FA } from '../../services/api';
import { getCurrentAuthUser, setCurrentAuthUser, subscribeAuthChanges } from '../../services/authSession';

const Feedback = ({ value, skin = 'staff' }) => value ? <p className={`${skin}-account-feedback`} role={value.error ? 'alert' : 'status'}>{value.text}</p> : null;

export default function OperationsAccountView({ user, variant = 'staff', profileExtras, securityExtras }) {
  const { policy, refreshPolicy } = usePasswordPolicy();
  const skin = variant === 'owner' ? 'owner' : 'staff';
  const acceptsRole = role => variant === 'owner' ? ['owner', 'admin'].includes(role) : role === 'store_staff';
  const location = useLocation();
  const [profile, setProfile] = useState({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [profileFeedback, setProfileFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [securityFeedback, setSecurityFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [twoFactorAvailable, setTwoFactorAvailable] = useState(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [setup, setSetup] = useState(null);
  const [securityPassword, setSecurityPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const hasPassword = user.has_local_password ?? !user.oauth_provider;
  const sessionGeneration = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeAuthChanges(nextUser => {
      if (!nextUser || String(nextUser.id) !== String(user.id) || !acceptsRole(nextUser.role)) sessionGeneration.current += 1;
    });
    return () => { mounted.current = false; sessionGeneration.current += 1; unsubscribe(); };
  }, [user.id, variant]);
  const trackRequest = () => {
    const generation = sessionGeneration.current;
    return () => {
      const current = getCurrentAuthUser();
      return mounted.current && generation === sessionGeneration.current && acceptsRole(current?.role) && String(current.id) === String(user.id);
    };
  };

  useEffect(() => {
    let active = true;
    getAuthAvailability().then(result => { if (active) setTwoFactorAvailable(Boolean(result?.two_factor?.available)); }).catch(() => { if (active) setTwoFactorAvailable(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (location.hash === '#security') document.getElementById(`${skin}-security`)?.scrollIntoView({ block: 'start' });
  }, [location.hash, skin]);

  const saveProfile = async event => {
    event.preventDefault();
    const isCurrent = trackRequest();
    if (!isCurrent()) return;
    setSaving(true);
    setProfileFeedback(null);
    try {
      const result = await updateProfile(user.id, profile);
      if (!isCurrent()) return;
      if (result.user) {
        setCurrentAuthUser({ ...getCurrentAuthUser(), ...result.user });
        setProfile({ name: result.user.name, email: result.user.email, phone: result.user.phone || '' });
      }
      setProfileFeedback({ text: result.message });
    } catch (error) {
      if (!isCurrent()) return;
      setProfileFeedback({ error: true, text: Object.values(error.fieldErrors || {}).join(' ') || error.message || 'Your account could not be saved. Try again.' });
    } finally { if (isCurrent()) setSaving(false); }
  };
  const savePassword = async event => {
    event.preventDefault();
    const isCurrent = trackRequest();
    if (!isCurrent()) return;
    if (password.next !== password.confirm) { setPasswordFeedback({ error: true, text: 'New passwords must match.' }); return; }
    if (hasPassword && password.current === password.next) { setPasswordFeedback({ error: true, text: 'Choose a different password from your current password.' }); return; }
    setChanging(true);
    setPasswordFeedback(null);
    try {
      const effectivePolicy = await refreshPolicy();
      if (!isCurrent()) return;
      const policyError = passwordPolicyError(password.next, effectivePolicy);
      if (policyError) throw new Error(policyError);
      if (hasPassword) await changePassword(password.current, password.next);
      else { await setLocalPassword(password.next); if (isCurrent()) setCurrentAuthUser({ ...getCurrentAuthUser(), has_local_password: true }); }
      if (!isCurrent()) return;
      setPassword({ current: '', next: '', confirm: '' });
      setPasswordFeedback({ text: hasPassword ? 'Your password has been changed.' : 'Local password set. Your connected account password is unchanged.' });
    } catch (error) { if (isCurrent()) setPasswordFeedback({ error: true, text: error.message || 'Password could not be changed. Try again.' }); }
    finally { if (isCurrent()) setChanging(false); }
  };
  const updateTwoFactor = async event => {
    event.preventDefault();
    const isCurrent = trackRequest();
    if (!isCurrent()) return;
    setTwoFactorBusy(true);
    setSecurityFeedback(null);
    try {
      if (setup) {
        const result = await verify2FA(code);
        if (!isCurrent()) return;
        setRecoveryCodes(Array.isArray(result.recovery_codes) ? result.recovery_codes : []);
        setCurrentAuthUser({ ...getCurrentAuthUser(), two_factor_enabled: true });
        setSetup(null);
        setCode('');
        setSecurityFeedback({ text: 'Two-factor authentication enabled. Save your recovery codes privately.' });
      } else if (user.two_factor_enabled) {
        await disable2FA(securityPassword);
        if (!isCurrent()) return;
        setCurrentAuthUser({ ...getCurrentAuthUser(), two_factor_enabled: false });
        setRecoveryCodes([]);
        setSecurityFeedback({ text: 'Two-factor authentication disabled.' });
      } else {
        const result = await setup2FA(securityPassword);
        if (!isCurrent()) return;
        setSetup(result);
        setSecurityFeedback({ text: 'Scan the QR code with your authenticator, then enter a current six-digit code.' });
      }
      setSecurityPassword('');
    } catch (error) { if (isCurrent()) setSecurityFeedback({ error: true, text: error.message || 'Security settings could not be updated. Try again.' }); }
    finally { if (isCurrent()) setTwoFactorBusy(false); }
  };

  return <div className="space-y-5">
    <PageHeader title={variant === 'owner' ? 'Account & Security' : 'Staff account & security'} description="Your contact details and sign-in protection for shop operations." />
    <div className={`${skin}-account-grid`}>
      <SectionCard title="Account details" description="Changes apply to your own account. Your role and permissions are managed by the business.">
        <form className={`${skin}-account-form`} onSubmit={saveProfile}>
          <label>Full name<input autoComplete="name" required minLength={2} maxLength={100} value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
          <label>Email address<input type="email" autoComplete="email" required readOnly={Boolean(user.email_managed_by_google)} value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} /></label>
          <small>{user.email_managed_by_google ? 'Your email is managed by Google.' : 'Email changes require verification before the new address is used.'}</small>
          <label>Phone number<input type="tel" autoComplete="tel" maxLength={13} value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} /></label>
          <p className="text-sm text-slate-600">Role: <strong className="text-slate-900">{variant === 'owner' ? (user.role === 'admin' ? 'Administrator' : 'Owner') : 'Store staff'}</strong></p>
          <Feedback skin={skin} value={profileFeedback} />
          <BrandButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</BrandButton>
        </form>
        {profileExtras}
      </SectionCard>
      <div id={`${skin}-security`} className="space-y-5 scroll-mt-5">
        <SectionCard title={hasPassword ? 'Change password' : 'Set a local password'} description={passwordRequirementsText(policy)}>
          <form className={`${skin}-account-form`} onSubmit={savePassword}>
            {hasPassword && <label>Current password<input type="password" autoComplete="current-password" required value={password.current} onChange={event => setPassword({ ...password, current: event.target.value })} /></label>}
            <label>New password<input type="password" autoComplete="new-password" required value={password.next} onChange={event => setPassword({ ...password, next: event.target.value })} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" required value={password.confirm} onChange={event => setPassword({ ...password, confirm: event.target.value })} /></label>
            <Feedback skin={skin} value={passwordFeedback} />
            <BrandButton variant="secondary" type="submit" disabled={changing}>{changing ? 'Updating…' : hasPassword ? 'Update password' : 'Set password'}</BrandButton>
          </form>
        </SectionCard>
        <SectionCard title="Two-factor authentication" description={variant === 'owner' ? 'Add an authenticator code to protect your Owner sign-in.' : 'Add an authenticator code to protect your Staff sign-in.'}>
          <div className="mb-4"><StatusBadge tone={user.two_factor_enabled ? 'success' : 'neutral'}>{user.two_factor_enabled ? 'Enabled' : 'Not enabled'}</StatusBadge></div>
          {twoFactorAvailable ? <form className={`${skin}-account-form`} onSubmit={updateTwoFactor}>
            {setup ? <><img src={setup.qrCode} width="192" height="192" alt="Scan this QR code with your authenticator app" /><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label></> : <label>{hasPassword ? 'Confirm your password' : 'Local password, if set'}<input type="password" autoComplete="current-password" required={hasPassword} value={securityPassword} onChange={event => setSecurityPassword(event.target.value)} /></label>}
            <Feedback skin={skin} value={securityFeedback} />
            <BrandButton variant={user.two_factor_enabled ? 'secondary' : 'primary'} type="submit" disabled={twoFactorBusy}>{twoFactorBusy ? 'Updating…' : setup ? 'Verify & enable' : user.two_factor_enabled ? 'Disable two-factor authentication' : 'Set up authenticator'}</BrandButton>
            {setup && <BrandButton variant="ghost" onClick={() => { setSetup(null); setCode(''); setSecurityFeedback(null); }}>Cancel setup</BrandButton>}
          </form> : <p className="text-sm leading-6 text-slate-600" role="status">{twoFactorAvailable === null ? 'Checking authenticator availability…' : 'Authenticator changes are currently unavailable. Contact your administrator for help.'}</p>}
          {recoveryCodes.length > 0 && <div className="mt-4 space-y-3"><p className="text-sm font-semibold">Recovery codes · save these privately</p><ul className="grid grid-cols-2 gap-2 text-sm font-mono">{recoveryCodes.map(value => <li key={value}>{value}</li>)}</ul><BrandButton variant="secondary" onClick={() => setRecoveryCodes([])}>I have saved my codes</BrandButton></div>}
        </SectionCard>
        {securityExtras}
      </div>
    </div>
  </div>;
}
