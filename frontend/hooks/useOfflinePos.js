import { useCallback,useEffect,useRef,useState } from 'react';
import { createPosOrder,getOfflinePosSnapshot,registerOfflinePosDevice } from '../services/api.js';
import { allPosValues,pendingPosSales,readPosValue,savePosSnapshot,writePosValue } from '../services/offlinePosDb.js';
import { synchronizeOfflineSales } from '../services/offlinePosSync.js';
import { renewUnlockedPos,lockLocalPos } from '../services/offlinePosAccess.js';
import { requirePosShell } from '../services/posPwa.js';
import { prepareOfflinePos } from '../services/offlinePosPreparation.js';

export default function useOfflinePos({ online,user }) {
  const [sales,setSales]=useState([]);
  const [snapshot,setSnapshot]=useState(null);
  const [syncing,setSyncing]=useState(false);
  const [message,setMessage]=useState('');
  const refreshing=useRef(null);
  const mounted=useRef(false);
  const refreshLocal=useCallback(async()=>{
    const [rows,meta]=await Promise.all([allPosValues('pending_sales'),readPosValue('metadata','snapshot')]);
    if(mounted.current){setSales(rows);setSnapshot(meta || null);}
  },[]);
  const refreshSnapshot=useCallback(async()=>{
    if (!online || !user?.role) return;
    const grant=await readPosValue('offline_access','grant');
    if (!grant) return;
    let fresh;
    try{fresh=await getOfflinePosSnapshot(grant.device_id);}
    catch(error){
      if(error.code==='OFFLINE_POS_DEVICE_REVOKED'){
        await writePosValue('offline_access',{...grant,expires_at:new Date(0).toISOString()});lockLocalPos();window.dispatchEvent(new Event('offline-pos:prepared'));
      }
      throw error;
    }
    await savePosSnapshot(fresh);
    const renewed={ ...grant,expires_at:fresh.expires_at,cashier:{id:user.id,name:user.name} };
    await writePosValue('offline_access',renewed);renewUnlockedPos(renewed);
    await refreshLocal();
    window.dispatchEvent(new Event('offline-pos:prepared'));
    return fresh;
  },[online,user?.id,user?.name,user?.role,refreshLocal]);
  const sync=useCallback(async()=>{
    if (!online || !user?.role || refreshing.current) return;
    const work=async()=>{
      const pending=await pendingPosSales();
      if (mounted.current) {setSyncing(Boolean(pending.some(s=>s.status==='pending')));setMessage('');}
      const outcome=await synchronizeOfflineSales({send:createPosOrder,onChange:refreshLocal});
      if(outcome.authenticationRequired){if(mounted.current)setMessage('Internet restored. Sign in to synchronize pending sales.');return;}
      await refreshLocal();
      // Snapshot refresh is shared by reconnect and successful online sales.
      if (!pending.some(s=>s.status==='attention')) await refreshSnapshot();
    };
    refreshing.current=work().catch(error=>{ if(mounted.current)setMessage(error.status===401 ? 'Internet restored. Sign in to synchronize pending sales.' : error.message || 'Offline preparation could not be refreshed. Pending sales are safe.'); }).finally(()=>{refreshing.current=null;if(mounted.current)setSyncing(false);});
    return refreshing.current;
  },[online,user?.role,refreshLocal,refreshSnapshot]);
  useEffect(()=>{
    mounted.current=true;
    void refreshLocal().catch(()=>setMessage('Offline storage is unavailable. Do not close the POS until pending sales are recovered.'));
    return()=>{mounted.current=false;};
  },[refreshLocal]);
  useEffect(()=>{
    if(!online || !user?.role)return;
    void sync();
    // Modest retry cadence, no repeated API calls while offline.
    const timer=setInterval(async()=>{if((await pendingPosSales()).some(s=>s.status==='pending'))void sync();},30000);
    return()=>clearInterval(timer);
  },[online,user?.role,sync]);
  const prepare=async (pin,onProgress,deviceName)=>{
    if(!online || !user?.role)throw new Error('Sign in online before preparing this computer.');
    const verified = await prepareOfflinePos({pin,deviceName,user,onProgress,requireShell:requirePosShell,registerDevice:registerOfflinePosDevice,getSnapshot:getOfflinePosSnapshot,refreshLocal});
    window.dispatchEvent(new Event('offline-pos:prepared'));
    navigator.storage?.persist?.().catch(()=>{});
    return verified;
  };
  return { sales,snapshot,syncing,message,sync,prepare,refreshLocal,refreshSnapshot,pending:sales.filter(s=>s.status!=='synchronized').length };
}
