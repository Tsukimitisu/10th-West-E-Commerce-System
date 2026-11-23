import React,{ useEffect,useState,useRef,useCallback } from 'react';
import OfflineReserveFields from './OfflineReserveFields.jsx';
import Modal from '../owner/Modal.jsx';
import { getOfflinePosDevice,getOfflinePosDevices,getOfflinePosReserves,getPosProducts,revokeOfflinePosDevice,renameOfflinePosDevice,saveOfflinePosReserve,getOfflinePosApproval,requestOfflinePosApproval,saveOfflinePosStockMode } from '../../services/api.js';
import { promptPosInstall } from '../../services/posPwa.js';
import { readPosValue,writePosValue } from '../../services/offlinePosDb.js';
import { verifyOfflinePreparation,getOfflinePosComputer } from '../../services/offlinePosPreparation.js';
import { lockLocalPos } from '../../services/offlinePosAccess.js';

export default function OfflinePosSetup({ onClose,offline,user,capabilities,managementOnly=false }) {
  const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  const [phase,setPhase]=useState('');
  const [ready,setReady]=useState(null);
  const [message,setMessage]=useState('');
  const [device,setDevice]=useState(null);
  const [devices,setDevices]=useState([]);
  const [computerUuid,setComputerUuid]=useState('');
  const [deviceName,setDeviceName]=useState('');
  const [approval,setApproval]=useState({status:'loading'});
  const [approvalError,setApprovalError]=useState('');
  const [reserveDevice,setReserveDevice]=useState('');
  const [allocations,setAllocations]=useState({reserves:[],stock:[]});
  const manageDevices=['owner','super_admin','admin'].includes(user?.role);
  const listDevices=manageDevices || capabilities?.can_manage_offline_reserve;
  const refreshDevices=async()=>{if(listDevices)setDevices((await getOfflinePosDevices()).devices || []);};
  const [search,setSearch]=useState('');
  const [products,setProducts]=useState([]);
  const [productId,setProductId]=useState('');
  const [variantId,setVariantId]=useState('');
  const [quantity,setQuantity]=useState('0');
  const [reviewed,setReviewed]=useState(false);
  const stockMode=device?.stock_mode || offline.snapshot?.stock_mode || 'manual';
  const product=products.find(p=>String(p.id)===productId);
  const checkApproval=useCallback(async()=>{
    try {
    const computer=await getOfflinePosComputer();setComputerUuid(computer.uuid);
    // Existing approved computers do not depend on the request-history lookup.
    const {device:registered}=await getOfflinePosDevice(computer.uuid);
    const result=registered?.is_active ? {status:'approved',device:registered} : manageDevices ? {status:'none',device:registered} : await getOfflinePosApproval(computer.uuid);
    if(result.device && result.device.device_uuid!==computer.uuid)throw new Error('Computer identity does not match. Ask an administrator to review this registration.');
    setApproval(result);setApprovalError('');setDevice(result.device || null);
    if(result.device?.is_active){setDeviceName(result.device.name);try{setReady(await verifyOfflinePreparation(result.device.id));}catch{setReady(null);}}
    else if(result.request?.requested_name)setDeviceName(result.request.requested_name);
    return result;
    } catch(error) {
      // A failed lookup must not leave the only request action hidden forever.
      // Keep known pending state so its normal 15-second polling can recover.
      setApproval(current=>current.status==='loading' ? {status:'unavailable'} : current);
      setApprovalError(error.message || 'Approval status could not be checked. Try again or request approval.');
      return null;
    }
  },[manageDevices]);
  useEffect(()=>{if(!managementOnly)void checkApproval().catch(e=>setMessage(e.message));else void readPosValue('metadata','computer').then(c=>setComputerUuid(c?.uuid || '')).catch(e=>setMessage(e.message));},[checkApproval,managementOnly]);
  useEffect(()=>{if(managementOnly || approval.status!=='pending')return;const timer=setInterval(()=>{void checkApproval().catch(e=>setMessage(e.message));},15000);return()=>clearInterval(timer);},[approval.status,checkApproval,managementOnly]);
  useEffect(()=>{if(!listDevices)return;let live=true;getOfflinePosDevices().then(r=>{if(live)setDevices(r.devices || []);}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[listDevices]);
  useEffect(()=>{if(!productId){setAllocations({reserves:[],stock:[]});return;}let live=true;getOfflinePosReserves(productId).then(r=>{if(live)setAllocations({reserves:r.reserves || [],stock:r.stock || []});}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[productId]);
  const chooseReserveDevice=id=>{setReserveDevice(id);setReviewed(false);const row=allocations.reserves.find(r=>String(r.device_id || 'unassigned')===id && Number(r.variant_id || 0)===Number(variantId || 0));setQuantity(String(id==='unassigned' || devices.find(d=>d.id===id)?.is_active===false ? 0 : row?.target_quantity || 0));};
  useEffect(()=>{let live=true;const timer=setTimeout(()=>getPosProducts({ search }).then(p=>{if(live)setProducts(p);}).catch(e=>{if(live)setMessage(e.message);}),300);return()=>{live=false;clearTimeout(timer);};},[search]);
  useEffect(()=>{const row=allocations.reserves.find(r=>String(r.device_id || 'unassigned')===reserveDevice && Number(r.variant_id || 0)===Number(variantId || 0));setQuantity(String(reserveDevice==='unassigned' || devices.find(d=>d.id===reserveDevice)?.is_active===false ? 0 : row?.target_quantity || 0));setReviewed(false);},[reserveDevice,variantId,allocations,devices]);
  const run=async task=>{if(working.current)return;working.current=true;setBusy(true);setMessage('');setPhase('');try{await task();}catch(e){setPhase('');setMessage(e.message || 'Offline preparation failed. Stay online and try again.');if(e.code==='OFFLINE_POS_DEVICE_APPROVAL_REQUIRED')await checkApproval().catch(()=>{});}finally{working.current=false;setBusy(false);}};
  const content=<div className="min-w-0 space-y-5 p-4">
    {!managementOnly && <>
    <section aria-live="polite" className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm"><h3 className="font-semibold">{!manageDevices && approval.status!=='approved' ? 'Request Device Approval' : 'Offline POS on this computer'}</h3>
      {approvalError && <><p role="alert" className="break-words text-red-800">{approvalError}</p><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4" onClick={()=>run(checkApproval)}>Retry approval check</button></>}
      {approval.status==='loading' && <><p>Checking computer approval…</p><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4" onClick={()=>run(checkApproval)}>Check approval status</button></>}
      {!manageDevices && approval.status!=='loading' && approval.status!=='approved' && <>
        <p className="font-semibold">{approval.status==='pending' ? 'Pending Approval' : approval.status==='rejected' ? 'Rejected' : approval.status==='expired' ? 'Request expired' : approval.status==='unavailable' ? 'Approval status unavailable' : 'Not approved'}</p>
        {approval.status==='pending' ? <><p>Request sent. Waiting for an Owner or System Administrator to approve this computer.</p><p>Computer: {approval.request?.requested_name}</p><p>Requested: {new Date(approval.request?.requested_at).toLocaleString()}</p><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4" onClick={()=>run(checkApproval)}>Check approval status</button></> : <>
          <p>{approval.status==='rejected' ? 'Contact an Owner or System Administrator if this computer should be approved.' : 'This computer needs approval before Offline POS can be prepared.'}</p>
          {approval.request?.rejection_reason && <p>{approval.request.rejection_reason}</p>}
          <label className="block font-semibold">Computer name<input maxLength={80} value={deviceName} onChange={e=>setDeviceName(e.target.value)} placeholder="James Laptop" className="mt-2 block min-h-11 w-full rounded-lg border p-3" /></label>
          <button type="button" disabled={busy || !computerUuid || !deviceName.trim()} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold disabled:opacity-40" onClick={()=>run(async()=>{setApproval(await requestOfflinePosApproval(computerUuid,deviceName));setApprovalError('');})}>{['none','unavailable'].includes(approval.status) ? 'Request Approval' : 'Request Again'}</button>
        </>}
      </>}
      {approval.status==='approved' && !ready && <p className="font-semibold text-emerald-800">Computer approved. Create your 6-digit Offline POS PIN to finish setup.</p>}
    </section>
    <ol className="list-inside list-decimal space-y-1 text-sm"><li>Get this computer approved, then set an offline PIN.</li><li>Ask an inventory manager to protect offline stock.</li><li>Synchronize the catalogue.</li><li>Install 10th West POS, or reopen it in this browser.</li></ol>
    <p className="text-sm">Each approved computer has its own PIN, catalogue, pending sales and stock allocation. Offline PIN access is limited to cash POS sales and expires unless renewed online.</p>
    {approval.status!=='loading' && (manageDevices || approval.status==='approved') && <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{setReady(null);const verified=await offline.prepare(pin,setPhase,deviceName);setReady(verified);setDevice(verified.device);setApproval({status:'approved',device:verified.device});setComputerUuid(verified.device.device_uuid);setDeviceName(verified.device.name);if(!reserveDevice)setReserveDevice(verified.device.id);setPin('');await refreshDevices();setMessage('Catalogue synchronized and offline PIN secured. Keep browser site data to preserve pending sales.');});}}>
      <label className="block text-sm font-semibold">Computer name<input maxLength={80} value={deviceName} onChange={e=>setDeviceName(e.target.value)} placeholder="Shop Main POS" className="mt-2 block min-h-11 w-full rounded-lg border p-3" /></label>
      {!manageDevices && <p className="text-sm">An owner or system administrator must approve a new computer first. You may prepare an already approved computer.</p>}
      <label className="block text-sm font-semibold">6-digit Offline POS PIN<input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
      <button type="submit" disabled={busy || !/^\d{6}$/.test(pin)} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold disabled:opacity-40">{busy && phase ? <><span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Preparing…</> : 'Prepare Offline POS'}</button>
    </form>}
    </>}
    {!managementOnly && device?.is_active && <section className="space-y-3 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">Offline Stock Mode</h3>
      <p>Only one active computer can be the primary automatic device. Protected offline stock is unavailable online. Switching to Manual keeps existing reserves.</p>
      <fieldset disabled={busy || !capabilities?.can_manage_offline_reserve} className="space-y-3">
        {['automatic','manual'].map(mode=><label key={mode} className="flex min-h-11 items-start gap-3"><input type="radio" name="offline-stock-mode" value={mode} checked={stockMode===mode} className="mt-1" onChange={()=>run(async()=>{const result=await saveOfflinePosStockMode(device.id,mode);setDevice(result.device);await refreshDevices();setMessage('Stock mode saved. Existing protected stock is unchanged. Sync Offline Inventory to update this computer.');})} /><span><strong>{mode==='automatic' ? 'Automatic' : 'Manual'}</strong><span className="block">{mode==='automatic' ? 'Keep offline inventory synchronized with safely available store stock.' : 'Set Offline POS reserve quantities manually.'}</span></span></label>)}
      </fieldset>
      {!capabilities?.can_manage_offline_reserve && <p>An authorized inventory manager can change this setting.</p>}
      {ready && <button disabled={busy} onClick={()=>run(async()=>{const fresh=await offline.refreshSnapshot();if(!fresh)throw new Error('Prepare Offline POS with a PIN before synchronizing this computer.');setReady(await verifyOfflinePreparation(fresh.device_id));setDevice(current=>({...current,stock_mode:fresh.stock_mode || current.stock_mode}));setMessage('Offline inventory updated successfully.');})} className="min-h-11 rounded-lg border px-3">Sync Offline Inventory</button>}
      {stockMode==='automatic' && <div aria-live="polite" className="space-y-1"><p>Automatic stock allocation: On</p><p>Products available offline: {offline.inventorySummary?.products || 0}</p><p>Units available offline: {offline.inventorySummary?.units || 0}</p><p>Last inventory sync: {offline.snapshot ? new Date(offline.snapshot.created_at).toLocaleString() : 'Not yet synchronized'}</p>{ready && !offline.inventorySummary?.units && <p>No stock is currently available for offline allocation.</p>}</div>}
    </section>}
    <div aria-live="polite" aria-atomic="true" className="space-y-3 text-sm">
      {phase && <p role="status">{phase}</p>}
      {message && <p role="status" className="rounded-lg border border-orange-200 bg-orange-50 p-3 break-words">{message}</p>}
      {ready && <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><h3 className="font-semibold">✓ Offline POS Ready</h3><p>Offline POS already enabled on this computer. This computer can continue cash sales during an internet outage.</p><p>Last catalogue sync: {new Date(ready.snapshot.created_at).toLocaleString()}</p><p>Offline access valid until: {new Date(ready.grant.expires_at).toLocaleString()}</p><p>To test Offline Mode, disconnect this computer from the internet. The POS will switch automatically.</p><p>Use Prepare Offline POS to renew access or update your offline PIN.</p></div>}
    </div>
    {capabilities?.can_manage_offline_reserve && <form id="offline-reserve-editor" className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await saveOfflinePosReserve({device_id:reserveDevice==='unassigned' ? null : reserveDevice,product_id:Number(productId),variant_id:variantId ? Number(variantId) : null,quantity:Number(quantity),reviewed});if(reserveDevice===device?.id && device?.is_active)await offline.refreshSnapshot();setAllocations(await getOfflinePosReserves(productId));setMessage('Offline stock reserve saved for the selected computer.');});}}>
      <h3 className="font-semibold">Offline POS reserve</h3><p className="text-sm">Quantity protected for in-store cash sales if the internet is unavailable. Existing online stock reservations are preserved.</p>
      <input aria-label="Find reserve product" placeholder="Find an inventory item" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-lg border p-3" />
      <select aria-label="Reserve product" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('');}} className="w-full rounded-lg border p-3"><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.part_number || p.sku}</option>)}</select>
      {product?.variants?.length>0 && <select aria-label="Reserve variant" value={variantId} onChange={e=>setVariantId(e.target.value)} className="w-full rounded-lg border p-3"><option value="">Select variant</option>{product.variants.map(v=><option key={v.id} value={v.id}>{v.variant_type}: {v.variant_value} — {v.sku}</option>)}</select>}
      <OfflineReserveFields devices={devices} reserves={allocations.reserves} stock={allocations.stock} variantId={variantId} deviceId={reserveDevice} onDeviceChange={chooseReserveDevice} quantity={quantity} onQuantityChange={setQuantity} reviewed={reviewed} onReviewChange={setReviewed} />
      <button disabled={busy || devices.some(d=>d.id===reserveDevice && d.is_active && d.stock_mode==='automatic') || !reserveDevice || !productId || (product?.variants?.length>0 && !variantId)} className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-40">Save offline reserve</button>
    </form>}
    {device && <p className="break-words text-sm"><strong>This computer:</strong> {device.name} · {device.is_active ? 'Active' : 'Revoked'}</p>}
    {listDevices && <section className="space-y-3 border-t pt-4 text-sm"><h3 className="font-semibold">Registered Offline POS Devices</h3>
      {!devices.length && <p>No computers registered yet.</p>}
      {[true,false].map(active=><section key={String(active)} className="space-y-3"><h4 className="font-semibold">{active ? 'Active devices' : 'Revoked devices'}</h4>{devices.filter(d=>d.is_active===active).map(row=><div key={row.id} className="space-y-2 rounded-lg border p-3"><p className="break-words font-semibold">{row.name}{row.device_uuid===computerUuid ? ' · This computer' : ''}</p><p>{row.is_active ? 'Active' : 'Revoked'} · Last sync: {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : 'Not yet synchronized'}</p>
        <p>Registered: {row.registered_at ? new Date(row.registered_at).toLocaleString() : 'Not available'}{row.registered_by_name ? ` by ${row.registered_by_name}` : ''}</p>{capabilities?.can_manage_offline_reserve && <label className="block">Offline Stock Mode<select aria-label={`Offline Stock Mode for ${row.name}`} disabled={busy || !row.is_active} value={row.stock_mode || 'manual'} onChange={e=>{const mode=e.target.value;void run(async()=>{const result=await saveOfflinePosStockMode(row.id,mode);if(device?.id===row.id)setDevice(result.device);await refreshDevices();setMessage('Stock mode saved. Existing protected stock is unchanged.');});}} className="mt-2 block min-h-11 w-full rounded-lg border p-3"><option value="automatic">Automatic (primary device)</option><option value="manual">Manual</option></select></label>}{manageDevices && <div className="flex flex-wrap gap-2">{capabilities?.can_manage_offline_reserve && <a href="#offline-reserve-editor" onClick={e=>{e.preventDefault();chooseReserveDevice(row.id);document.getElementById('offline-reserve-editor')?.scrollIntoView({block:'center',behavior:'smooth'});}} className="inline-flex min-h-11 items-center rounded-lg border px-3">Manage reserve</a>}<button type="button" disabled={busy} className="min-h-11 rounded-lg border px-3" onClick={()=>{const name=window.prompt('Computer name',row.name);if(name)void run(async()=>{await renameOfflinePosDevice(row.id,name);await refreshDevices();if(device?.id===row.id){setDevice({...device,name});setDeviceName(name);}});}}>Rename</button>
          {row.is_active && <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-red-300 px-3 text-red-700" onClick={()=>{if(window.confirm(`Revoke ${row.name}? Only this computer will be revoked. ${row.device_uuid===computerUuid ? (managementOnly ? 'Review this computer for unsynchronized sales before revoking.' : `${offline.pending} local sale(s) still need synchronization.`) : 'Unsynchronized sales may remain on that laptop.'} Its remaining stock will stay protected until inventory review.`))void run(async()=>{await revokeOfflinePosDevice(row.id);if(row.device_uuid===computerUuid){const grant=await readPosValue('offline_access','grant');if(grant?.device_id===row.id){await writePosValue('offline_access',{...grant,expires_at:new Date(0).toISOString()});lockLocalPos();window.dispatchEvent(new Event('offline-pos:prepared'));}setReady(null);setDevice({...row,is_active:false});}await refreshDevices();if(productId)setAllocations(await getOfflinePosReserves(productId));setMessage(`${row.name} revoked. Only its remaining stock is quarantined for review.`);});}}>Revoke {row.name}</button>}
        </div>}
      </div>)}</section>)}
    </section>}

    {!managementOnly && <div className="flex flex-wrap gap-2"><button onClick={async()=>{if(!await promptPosInstall())setMessage('Use your browser’s Install app or Add to Home Screen option where available. Installation is optional after the offline app is prepared.');}} className="min-h-11 rounded-lg border px-3">Install 10th West POS</button></div>}
    {offline.snapshot && <p className="text-sm">Last inventory sync: {new Date(offline.snapshot.created_at).toLocaleString()}. Offline access valid until {new Date(offline.snapshot.expires_at).toLocaleString()}.</p>}
  </div>;
  return managementOnly ? content : <Modal isOpen title="Offline POS setup" onClose={()=>!busy && onClose()} size="xl">{content}</Modal>;
}
