import React from 'react';

export default function OfflineReserveFields({devices,reserves,stock,variantId,deviceId,onDeviceChange,quantity,onQuantityChange,reviewed,onReviewChange}) {
  const rows=reserves.filter(r=>Number(r.variant_id || 0)===Number(variantId || 0));
  const current=rows.find(r=>String(r.device_id || 'unassigned')===deviceId);
  const target=devices.find(d=>d.id===deviceId);
  const releaseOnly=deviceId==='unassigned' || (target && !target.is_active);
  const automatic=target?.is_active && target.stock_mode==='automatic';
  const inventory=stock.find(r=>Number(r.variant_id || 0)===Number(variantId || 0));
  return <div className="space-y-3 text-sm">
    <label className="block">Device<select aria-label="Device" required value={deviceId} onChange={e=>onDeviceChange(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border p-3"><option value="">Select a computer</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (revoked - review to release)' : ''}</option>)}{rows.some(r=>!r.device_id) && <option value="unassigned">Unassigned legacy protection - review to release</option>}</select></label>
    <label className="block">Offline reserve quantity<input aria-label="Offline reserve quantity" disabled={automatic} type="number" min={0} max={releaseOnly ? 0 : 10000} step={1} required value={quantity} onChange={e=>onQuantityChange(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border p-3" /></label>
    {automatic && <p>This computer uses Automatic stock mode. Switch it to Manual before setting reserve quantities.</p>}
    <p>Selected allocation: {current?.remaining || 0} protected. Configured target: {current?.target_quantity || 0}.</p>
    {inventory && <p>Physical stock: {inventory.stock_quantity} · Total Offline Protected: {inventory.offline_protected} · Other Reserved: {inventory.other_reserved} · Online Available: {inventory.online_available}</p>}
    {rows.length>0 && <ul className="space-y-1">{rows.map(r=><li key={r.id || `${r.device_id}:${r.variant_id}`} className="break-words">{r.device_name || 'Unassigned legacy protection'}: {r.remaining}{r.quarantined ? ' (quarantined)' : ''}</li>)}</ul>}
    <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={e=>onReviewChange(e.target.checked)} className="mt-1" /><span>I reviewed this device's pending sales and physical stock before reducing, releasing or reassigning its protected reserve.</span></label>
    {releaseOnly && <p>Revoked or unassigned protection may only be released to zero after review. Reauthorize a revoked computer before allocating stock again.</p>}
  </div>;
}
