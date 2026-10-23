import React,{ lazy,Suspense,useEffect,useState } from 'react';
import usePosConnection from '../../hooks/usePosConnection.js';
import { readPosValue,pendingPosSales } from '../../services/offlinePosDb.js';
import { currentOfflineAccess,unlockOfflinePos,lockLocalPos } from '../../services/offlinePosAccess.js';
import { setOfflinePosRestricted } from '../../services/offlinePosScope.js';
const PosTerminal=lazy(()=>import('../../pages/staff/PosTerminal.jsx'));
const roles=['owner','admin','super_admin','store_staff','cashier'];
export default function OfflinePosRoute({ user }) {
  const connection=usePosConnection();
  const [grant,setGrant]=useState(currentOfflineAccess);
  const [prepared,setPrepared]=useState(null);
  const [pending,setPending]=useState(0);
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let live=true;
    const read=()=>Promise.all([readPosValue('offline_access','grant'),readPosValue('metadata','snapshot'),pendingPosSales()]).then(([access,snapshot,sales])=>{ if(live){ setPrepared(Boolean(access && snapshot));setPending(sales.length);setGrant(currentOfflineAccess()); } }).catch(()=>{if(live)setPrepared(false);});
    void read();window.addEventListener('offline-pos:prepared',read);
    return ()=>{live=false;window.removeEventListener('offline-pos:prepared',read);};
  },[]);
  useEffect(()=>{ if(connection.online!==null)setOfflinePosRestricted(connection.online===false); },[connection.online]);
  useEffect(()=>{if(connection.online && (!user || !roles.includes(user.role))){lockLocalPos();setGrant(null);}},[connection.online,user?.id,user?.role]);
  const unlock=async event=>{
    event.preventDefault(); setBusy(true);setError('');
    try { setGrant(await unlockOfflinePos(pin));setPin(''); }
    catch(e){setError(e.message);setPin('');}
    finally{setBusy(false);}
  };
  if (connection.online && user && roles.includes(user.role)) return <Suspense fallback={<p role="status">Opening POS…</p>}><PosTerminal userOverride={user} connection={connection} /></Suspense>;
  if (connection.online===false && grant && Date.parse(grant.expires_at)>Date.now()) return <Suspense fallback={<p role="status">Opening offline POS…</p>}><PosTerminal userOverride={grant.cashier} connection={connection} /></Suspense>;
  return <main className="offline-pos-entry mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
    <h1 className="font-display text-3xl font-bold">10th West POS</h1>
    {connection.online===null || prepared===null ? <p role="status">Checking POS connection…</p> : connection.online ? <><p>{pending ? `Internet restored. Sign in to synchronize ${pending} pending sales.` : 'Sign in with your authorized POS account.'}</p><a className="rounded-lg bg-orange-500 p-3 text-center font-bold" href="#/login?redirect=%2Fpos">Sign in</a></> : !prepared ? <><h2 className="text-xl font-semibold">Offline POS is not ready on this computer.</h2><p>Connect to the internet once to prepare the POS for offline use.</p></> : <form onSubmit={unlock} className="space-y-4"><p>Offline mode. Enter this computer’s Offline POS PIN to continue cash sales.</p><label className="block">Offline POS PIN<input aria-label="Offline POS PIN" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label>{error && <p role="alert">{error}</p>}<button disabled={busy || !/^\d{6}$/.test(pin)} className="min-h-12 w-full rounded-lg bg-orange-500 font-bold disabled:opacity-50">{busy?'Unlocking…':'Unlock offline POS'}</button><p className="text-sm">This PIN unlocks only the cached POS. Pending sales remain saved if offline access expires.</p></form>}
    <button className="min-h-11 rounded-lg border p-2" onClick={connection.check}>Check connection</button>
  </main>;
}
