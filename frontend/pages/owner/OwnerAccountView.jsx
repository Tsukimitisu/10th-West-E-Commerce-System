import React, { useEffect, useRef, useState } from 'react';
import OperationsAccountView from '../../components/operations/OperationsAccountView';
import SectionCard from '../../components/operations/SectionCard';
import BrandButton from '../../components/ui/BrandButton';
import { ConfirmationDialog } from '../../components/ui/BrandPrimitives';
import { getActiveSessions, revokeSession, getProfile, updateProfile, uploadProfileAvatar } from '../../services/api';
import { getCurrentAuthUser, setCurrentAuthUser } from '../../services/authSession';

function OwnerPhoto({ user }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const save = async event => {
    event.preventDefault(); if (!file || busy) return;
    setBusy(true); setError('');
    const current = () => mounted.current && getCurrentAuthUser()?.id === user.id && ['owner','admin'].includes(getCurrentAuthUser()?.role);
    try {
      const avatar = await uploadProfileAvatar(file);
      if (!current()) return;
      const latest = getCurrentAuthUser();
      const result = await updateProfile(latest.id, { name: latest.name, email: latest.email, phone: latest.phone || '', avatar });
      if (!current()) return;
      setCurrentAuthUser({ ...getCurrentAuthUser(), ...result.user }); setFile(null);
    } catch (failure) { if (current()) setError(failure.message || 'Photo could not be saved. Please try again.'); }
    finally { if (current()) setBusy(false); }
  };
  return <form className="owner-account-form mt-6 border-t border-slate-200 pt-5" onSubmit={save}>
    <h3 className="text-sm font-semibold">Profile photo</h3>
    {(preview || user.avatar) && <img src={preview || user.avatar} width="64" height="64" className="h-16 w-16 rounded-lg object-cover" alt="Your profile" />}
    <label>Choose profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
      const selected = event.target.files?.[0]; setError('');
      if (!selected) { setFile(null); return; }
      if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 2 * 1024 * 1024) { setFile(null); event.target.value = ''; setError('Choose a JPG, PNG or WebP image no larger than 2 MB.'); return; }
      setFile(selected);
    }} /></label>
    <small>JPG, PNG or WebP · up to 2 MB.</small>
    {error && <p role="alert" className="owner-account-feedback">{error}</p>}
    <BrandButton variant="secondary" type="submit" disabled={!file || busy}>{busy ? 'Saving photo…' : 'Save photo'}</BrandButton>
  </form>;
}

function OwnerSessions({ user }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    getActiveSessions().then(rows => { if (mounted.current) setSessions(Array.isArray(rows) ? rows : []); }).catch(() => { if (mounted.current) setError('Sessions could not be loaded. Reload this page to retry.'); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);
  const revoke = async () => {
    if (!target || busy) return; setBusy(true);
    try {
      await revokeSession(target.id);
      await getProfile(); // A revoked current session follows existing auth expiry handling.
      if (!mounted.current || getCurrentAuthUser()?.id !== user.id) return;
      setSessions(rows => rows.filter(row => row.id !== target.id)); setTarget(null);
    } catch (failure) { if (mounted.current) { setTarget(null); setError(failure.message || 'Session could not be revoked.'); } }
    finally { if (mounted.current) setBusy(false); }
  };
  return <>
    <SectionCard title="Active sessions" description="Devices currently signed in to your account. Revoking this device may sign you out.">
      {error && <p role="alert" className="owner-account-feedback">{error}</p>}
      {loading ? <p role="status" className="text-sm">Loading sessions…</p> : sessions.length ? <ul className="divide-y divide-slate-200">{sessions.map(session => <li key={session.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{session.user_agent || 'Device details unavailable'}</p><p className="mt-1 text-xs text-slate-600">Last active: {session.last_active ? new Date(session.last_active).toLocaleString() : 'Not reported'}</p></div><BrandButton variant="secondary" onClick={() => setTarget(session)}>Revoke session</BrandButton></li>)}</ul> : !error && <p className="text-sm text-slate-600">No active session records were returned.</p>}
    </SectionCard>
    <ConfirmationDialog isOpen={Boolean(target)} onClose={() => { if (!busy) setTarget(null); }} onConfirm={revoke} title="Revoke session?" description="This device will need to sign in again. Other sessions remain active." confirmLabel="Revoke session" busy={busy} danger presentation="owner-confirmation" />
  </>;
}

export default function OwnerAccountView({ user }) {
  return <OperationsAccountView user={user} variant="owner" profileExtras={<OwnerPhoto user={user} />} securityExtras={<>
    <SectionCard title="Connected sign-in" description="Your existing account connection."><p className="text-sm text-slate-700">{['google','facebook'].includes(user.oauth_provider) ? `Signed in with ${user.oauth_provider === 'google' ? 'Google' : 'Facebook'}.` : 'No connected sign-in provider is reported for this account.'}</p><p className="mt-2 text-sm text-slate-600">Account status: {user.is_active === false ? 'Disabled' : user.is_active === true ? 'Active' : 'Signed in'}</p></SectionCard>
    <OwnerSessions user={user} />
  </>} />;
}
