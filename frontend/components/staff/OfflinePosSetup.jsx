import React,{ useEffect,useState } from 'react';
import Modal from '../owner/Modal.jsx';
import { getOfflinePosDevice,getPosProducts,revokeOfflinePosDevice,saveOfflinePosReserve } from '../../services/api.js';
import { promptPosInstall } from '../../services/posPwa.js';
import { readPosValue,writePosValue } from '../../services/offlinePosDb.js';
import { lockLocalPos } from '../../services/offlinePosAccess.js';

export default function OfflinePosSetup({ onClose,offline,user,capabilities }) {
  const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [device,setDevice]=useState(null);
  const [search,setSearch]=useState('');
  const [products,setProducts]=useState([]);
  const [productId,setProductId]=useState('');
  const [variantId,setVariantId]=useState('');
  const [quantity,setQuantity]=useState('0');
  const [reviewed,setReviewed]=useState(false);
  const product=products.find(p=>String(p.id)===productId);
  useEffect(()=>{getOfflinePosDevice().then(r=>setDevice(r.device)).catch(e=>setMessage(e.message));},[]);
  useEffect(()=>{let live=true;const timer=setTimeout(()=>getPosProducts({ search }).then(p=>{if(live)setProducts(p);}).catch(e=>{if(live)setMessage(e.message);}),300);return()=>{live=false;clearTimeout(timer);};},[search]);
  const run=async task=>{setBusy(true);setMessage('');try{await task();}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  return <Modal isOpen title="Offline POS setup" onClose={()=>!busy && onClose()} size="xl"><div className="space-y-5 p-4">
    <ol className="list-inside list-decimal space-y-1 text-sm"><li>Register this computer and set an offline PIN.</li><li>Ask an inventory manager to protect offline stock.</li><li>Synchronize the catalogue.</li><li>Install 10th West POS, or reopen it in this browser.</li></ol>
    <p className="text-sm">Use only this shop computer. Offline PIN access is limited to cash POS sales and expires unless renewed online.</p>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{await offline.prepare(pin);setPin('');setDevice((await getOfflinePosDevice()).device);setMessage('Offline POS enabled. Catalogue synchronized. Keep this browser’s site data to preserve pending sales.');});}}>
      <label className="block text-sm font-semibold">6-digit Offline POS PIN<input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
      <button disabled={busy || !/^\d{6}$/.test(pin)} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold disabled:opacity-40">Enable offline POS on this computer</button>
    </form>
    {capabilities?.can_manage_offline_reserve && <form className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await saveOfflinePosReserve({product_id:Number(productId),variant_id:variantId ? Number(variantId) : null,quantity:Number(quantity),reviewed});await offline.refreshSnapshot();setMessage('Offline stock reserve saved.');});}}>
      <h3 className="font-semibold">Offline POS reserve</h3><p className="text-sm">Quantity protected for in-store cash sales if the internet is unavailable. Existing online stock reservations are preserved.</p>
      <input aria-label="Find reserve product" placeholder="Find an inventory item" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-lg border p-3" />
      <select aria-label="Reserve product" value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('');}} className="w-full rounded-lg border p-3"><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.part_number || p.sku}</option>)}</select>
      {product?.variants?.length>0 && <select aria-label="Reserve variant" value={variantId} onChange={e=>setVariantId(e.target.value)} className="w-full rounded-lg border p-3"><option value="">Select variant</option>{product.variants.map(v=><option key={v.id} value={v.id}>{v.variant_type}: {v.variant_value} — {v.sku}</option>)}</select>}
      <label className="block text-sm">Offline reserve quantity<input type="number" min={0} max={10000} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} className="ml-2 w-24 rounded-lg border p-2" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1" />After replacing a computer: I reviewed physical stock and the old computer’s pending sales before reassigning its protected reserve.</label>
      <button disabled={busy || !productId || (product?.variants?.length>0 && !variantId)} className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-40">Save offline reserve</button>
    </form>}
    {device && <div className="space-y-2 border-t pt-4 text-sm"><h3 className="font-semibold">Offline POS device: Active</h3><p>Computer: {device.name}</p><p>Last synchronized: {device.last_synced_at ? new Date(device.last_synced_at).toLocaleString() : 'Not yet synchronized'}</p>{['owner','super_admin','admin'].includes(user?.role) && <button disabled={busy} className="min-h-11 rounded-lg border border-red-300 px-3 text-red-700" onClick={()=>{if(window.confirm(`Revoke offline access? ${offline.pending} local sale(s) still need synchronization. Other pending sales may exist on the disconnected computer. Review these before replacing it.`))void run(async()=>{await revokeOfflinePosDevice();const grant=await readPosValue('offline_access','grant');if(grant?.device_id===device.id){await writePosValue('offline_access',{...grant,expires_at:new Date(0).toISOString()});lockLocalPos();window.dispatchEvent(new Event('offline-pos:prepared'));}setDevice(null);setMessage('Device revoked. Protected stock remains reserved until an inventory manager reviews it.');});}}>Revoke offline access</button>}</div>}
    <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>run(async()=>{await offline.refreshSnapshot();setMessage('Catalogue synchronized.');})} className="min-h-11 rounded-lg border px-3">Synchronize catalogue</button><button onClick={async()=>{if(!await promptPosInstall())setMessage('Use your browser’s Install app or Add to Home Screen option where available. Installation is optional after the offline app is prepared.');}} className="min-h-11 rounded-lg border px-3">Install 10th West POS</button></div>
    {offline.snapshot && <p className="text-sm">Last inventory sync: {new Date(offline.snapshot.created_at).toLocaleString()}. Offline access valid until {new Date(offline.snapshot.expires_at).toLocaleString()}.</p>}
    {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
  </div></Modal>;
}
