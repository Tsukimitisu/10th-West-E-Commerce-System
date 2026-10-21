import React,{ useEffect,useState,useRef } from 'react';
import OfflineReserveFields from './OfflineReserveFields.jsx';
import Modal from '../owner/Modal.jsx';
import { getOfflinePosDevice,getOfflinePosDevices,getOfflinePosReserves,getPosProducts,revokeOfflinePosDevice,renameOfflinePosDevice,saveOfflinePosReserve } from '../../services/api.js';
import { promptPosInstall } from '../../services/posPwa.js';
import { readPosValue,writePosValue } from '../../services/offlinePosDb.js';
import { verifyOfflinePreparation } from '../../services/offlinePosPreparation.js';
import { lockLocalPos } from '../../services/offlinePosAccess.js';

export default function OfflinePosSetup({ onClose,offline,user,capabilities }) {
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
  const product=products.find(p=>String(p.id)===productId);
  useEffect(()=>{let live=true;void (async()=>{
    const computer=await readPosValue('metadata','computer');if(!live)return;setComputerUuid(computer?.uuid || '');
    if(computer?.uuid){const r=await getOfflinePosDevice(computer.uuid);if(!live)return;setDevice(r.device);if(r.device?.is_active){setDeviceName(r.device.name);try{const verified=await verifyOfflinePreparation(r.device.id);if(live)setReady(verified);}catch{/* Incomplete local setup remains unprepared. */}}}
  })().catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[]);
  useEffect(()=>{if(!listDevices)return;let live=true;getOfflinePosDevices().then(r=>{if(live)setDevices(r.devices || []);}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[listDevices]);
  useEffect(()=>{if(!productId){setAllocations({reserves:[],stock:[]});return;}let live=true;getOfflinePosReserves(productId).then(r=>{if(live)setAllocations({reserves:r.reserves || [],stock:r.stock || []});}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[productId]);
  const chooseReserveDevice=id=>{setReserveDevice(id);setReviewed(false);const row=allocations.reserves.find(r=>String(r.device_id || 'unassigned')===id && Number(r.variant_id || 0)===Number(variantId || 0));setQuantity(String(id==='unassigned' || devices.find(d=>d.id===id)?.is_active===false ? 0 : row?.target_quantity || 0));};
  useEffect(()=>{let live=true;const timer=setTimeout(()=>getPosProducts({ search }).then(p=>{if(live)setProducts(p);}).catch(e=>{if(live)setMessage(e.message);}),300);return()=>{live=false;clearTimeout(timer);};},[search]);
  useEffect(()=>{const row=allocations.reserves.find(r=>String(r.device_id || 'unassigned')===reserveDevice && Number(r.variant_id || 0)===Number(variantId || 0));setQuantity(String(reserveDevice==='unassigned' || devices.find(d=>d.id===reserveDevice)?.is_active===false ? 0 : row?.target_quantity || 0));setReviewed(false);},[reserveDevice,variantId,allocations,devices]);
  const run=async task=>{if(working.current)return;working.current=true;setBusy(true);setMessage('');setPhase('');try{await task();}catch(e){setPhase('');setMessage(e.message || 'Offline preparation failed. Stay online and try again.');}finally{working.current=false;setBusy(false);}};
  return <Modal isOpen title="Offline POS setup" onClose={()=>!busy && onClose()} size="xl"><div className="space-y-5 p-4">
    <ol className="list-inside list-decimal space-y-1 text-sm"><li>Register this computer and set an offline PIN.</li><li>Ask an inventory manager to protect offline stock.</li><li>Synchronize the catalogue.</li><li>Install 10th West POS, or reopen it in this browser.</li></ol>
    <p className="text-sm">Each approved computer has its own PIN, catalogue, pending sales and stock allocation. Offline PIN access is limited to cash POS sales and expires unless renewed online.</p>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{setReady(null);const verified=await offline.prepare(pin,setPhase,deviceName);setReady(verified);setDevice(verified.device);setComputerUuid(verified.device.device_uuid);setDeviceName(verified.device.name);if(!reserveDevice)setReserveDevice(verified.device.id);setPin('');await refreshDevices();setMessage('Catalogue synchronized and offline PIN secured. Keep browser site data to preserve pending sales.');});}}>
      <label className="block text-sm font-semibold">Computer name<input maxLength={80} value={deviceName} onChange={e=>setDeviceName(e.target.value)} placeholder="Shop Main POS" className="mt-2 block min-h-11 w-full rounded-lg border p-3" /></label>
      {!manageDevices && <p className="text-sm">An owner or system administrator must approve a new computer first. You may prepare an already approved computer.</p>}
      <label className="block text-sm font-semibold">6-digit Offline POS PIN<input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
      <button type="submit" disabled={busy || !/^\d{6}$/.test(pin)} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold disabled:opacity-40">{busy && phase ? <><span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Preparing…</> : 'Prepare Offline POS'}</button>
    </form>
    <div aria-live="polite" aria-atomic="true" className="space-y-3 text-sm">
      {phase && <p role="status">{phase}</p>}
      {message && <p role="status" className="rounded-lg border border-orange-200 bg-orange-50 p-3 break-words">{message}</p>}
      {ready && <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><h3 className="font-semibold">✓ Offline POS Ready</h3><p>Offline POS already enabled on this computer. This computer can continue cash sales during an internet outage.</p><p>Last catalogue sync: {new Date(ready.snapshot.created_at).toLocaleString()}</p><p>Offline access valid until: {new Date(ready.grant.expires_at).toLocaleString()}</p><p>To test Offline Mode, disconnect this computer from the internet. The POS will switch automatically.</p><p>Use Prepare Offline POS to renew access or update your offline PIN.</p></div>}
    </div>
    {capabilities?.can_manage_offline_reserve && <form className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await saveOfflinePosReserve({device_id:reserveDevice==='unassigned' ? null : reserveDevice,product_id:Number(productId),variant_id:variantId ? Number(variantId) : null,quantity:Number(quantity),reviewed});if(reserveDevice===device?.id && device?.is_active)await offline.refreshSnapshot();setAllocations(await getOfflinePosReserves(productId));setMessage('Offline stock reserve saved for the selected computer.');});}}>
      <h3 className="font-semibold">Offline POS reserve</h3><p className="text-sm">Quantity protected for in-store cash sales if the internet is unavailable. Existing online stock reservations are preserved.</p>
      <input aria-label="Find reserve product" placeholder="Find an inventory item" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-lg border p-3" />
      <select aria-label="Reserve product" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('');}} className="w-full rounded-lg border p-3"><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.part_number || p.sku}</option>)}</select>
      {product?.variants?.length>0 && <select aria-label="Reserve variant" value={variantId} onChange={e=>setVariantId(e.target.value)} className="w-full rounded-lg border p-3"><option value="">Select variant</option>{product.variants.map(v=><option key={v.id} value={v.id}>{v.variant_type}: {v.variant_value} — {v.sku}</option>)}</select>}
      <OfflineReserveFields devices={devices} reserves={allocations.reserves} stock={allocations.stock} variantId={variantId} deviceId={reserveDevice} onDeviceChange={chooseReserveDevice} quantity={quantity} onQuantityChange={setQuantity} reviewed={reviewed} onReviewChange={setReviewed} />
      <button disabled={busy || !reserveDevice || !productId || (product?.variants?.length>0 && !variantId)} className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-40">Save offline reserve</button>
    </form>}
    {device && <p className="break-words text-sm"><strong>This computer:</strong> {device.name} · {device.is_active ? 'Active' : 'Revoked'}</p>}
    {listDevices && <section className="space-y-3 border-t pt-4 text-sm"><h3 className="font-semibold">Registered Offline POS Devices</h3>
      {!devices.length && <p>No computers registered yet.</p>}
      {devices.map(row=><div key={row.id} className="space-y-2 rounded-lg border p-3"><p className="break-words font-semibold">{row.name}{row.device_uuid===computerUuid ? ' · This computer' : ''}</p><p>{row.is_active ? 'Active' : 'Revoked'} · Last sync: {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : 'Not yet synchronized'}</p>
        {manageDevices && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-3" onClick={()=>{const name=window.prompt('Computer name',row.name);if(name)void run(async()=>{await renameOfflinePosDevice(row.id,name);await refreshDevices();if(device?.id===row.id){setDevice({...device,name});setDeviceName(name);}});}}>Rename</button>
          {row.is_active && <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-red-300 px-3 text-red-700" onClick={()=>{if(window.confirm(`Revoke ${row.name}? Only this computer will be revoked. ${row.device_uuid===computerUuid ? `${offline.pending} local sale(s) still need synchronization.` : 'Unsynchronized sales may remain on that laptop.'} Its remaining stock will stay protected until inventory review.`))void run(async()=>{await revokeOfflinePosDevice(row.id);if(row.device_uuid===computerUuid){const grant=await readPosValue('offline_access','grant');if(grant?.device_id===row.id){await writePosValue('offline_access',{...grant,expires_at:new Date(0).toISOString()});lockLocalPos();window.dispatchEvent(new Event('offline-pos:prepared'));}setReady(null);setDevice({...row,is_active:false});}await refreshDevices();if(productId)setAllocations(await getOfflinePosReserves(productId));setMessage(`${row.name} revoked. Only its remaining stock is quarantined for review.`);});}}>Revoke {row.name}</button>}
        </div>}
      </div>)}
    </section>}

    <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>run(async()=>{const fresh=await offline.refreshSnapshot();if(!fresh)throw new Error('Prepare Offline POS with a PIN before synchronizing this computer.');setReady(await verifyOfflinePreparation(fresh.device_id));setMessage('Catalogue synchronized.');})} className="min-h-11 rounded-lg border px-3">Synchronize catalogue</button><button onClick={async()=>{if(!await promptPosInstall())setMessage('Use your browser’s Install app or Add to Home Screen option where available. Installation is optional after the offline app is prepared.');}} className="min-h-11 rounded-lg border px-3">Install 10th West POS</button></div>
    {offline.snapshot && <p className="text-sm">Last inventory sync: {new Date(offline.snapshot.created_at).toLocaleString()}. Offline access valid until {new Date(offline.snapshot.expires_at).toLocaleString()}.</p>}
  </div></Modal>;
}
