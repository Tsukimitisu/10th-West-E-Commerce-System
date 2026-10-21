import React,{useEffect,useState} from 'react';
import Modal from './Modal.jsx';
import OfflineReserveFields from '../staff/OfflineReserveFields.jsx';
import { getOfflinePosDevices,getOfflinePosReserves,getProductVariants,saveOfflinePosReserve } from '../../services/api.js';

export default function OfflinePosReserveModal({product,onClose,onSaved}){
  const [variants,setVariants]=useState([]);
  const [reserves,setReserves]=useState([]);
  const [devices,setDevices]=useState([]);
  const [deviceId,setDeviceId]=useState('');
  const [stock,setStock]=useState([]);
  const [variantId,setVariantId]=useState('');
  const [quantity,setQuantity]=useState('0');
  const [reviewed,setReviewed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;Promise.all([getProductVariants(product.id),getOfflinePosReserves(product.id),getOfflinePosDevices()]).then(([v,r,d])=>{if(!active)return;setVariants(v.variants || []);setReserves(r.reserves);setStock(r.stock || []);setDevices(d.devices || []);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[product.id]);
  const current=reserves.find(r=>String(r.device_id || 'unassigned')===deviceId && Number(r.variant_id || 0)===Number(variantId || 0));
  const reviewRequired=deviceId==='unassigned' || devices.find(d=>d.id===deviceId)?.is_active===false || current?.quarantined || Number(quantity)<Number(current?.remaining || 0);
  useEffect(()=>{const row=reserves.find(r=>String(r.device_id || 'unassigned')===deviceId && Number(r.variant_id || 0)===Number(variantId || 0));setQuantity(String(deviceId==='unassigned' || devices.find(d=>d.id===deviceId)?.is_active===false ? 0 : row?.target_quantity || 0));setReviewed(false);},[deviceId,variantId,reserves,devices]);
  const save=async e=>{e.preventDefault();setLoading(true);setError('');try{await saveOfflinePosReserve({device_id:deviceId==='unassigned' ? null : deviceId,product_id:product.id,variant_id:variantId?Number(variantId):null,quantity:Number(quantity),reviewed});await onSaved?.();onClose();}catch(e){setError(e.message);}finally{setLoading(false);}};
  return <Modal isOpen title={`Offline POS reserve — ${product.name || product.product_name}`} onClose={()=>!loading && onClose()}><form onSubmit={save} className="space-y-4 p-4"><p className="text-sm">Quantity protected for in-store cash sales if the internet is unavailable. This reduces online availability without changing physical stock.</p>{variants.length>0 && <label className="block text-sm">Variant<select value={variantId} onChange={e=>{setVariantId(e.target.value);setQuantity(String(reserves.find(r=>Number(r.variant_id)===Number(e.target.value))?.target_quantity || 0));}} className="mt-2 block w-full rounded-lg border p-3"><option value="">Select variant</option>{variants.map(v=><option key={v.id} value={v.id}>{v.variant_type}: {v.variant_value} — {v.sku}</option>)}</select></label>}<OfflineReserveFields devices={devices} reserves={reserves} stock={stock} variantId={variantId} deviceId={deviceId} onDeviceChange={setDeviceId} quantity={quantity} onQuantityChange={setQuantity} reviewed={reviewed} onReviewChange={setReviewed} />{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button type="button" onClick={onClose} disabled={loading} className="min-h-11 flex-1 rounded-lg border">Cancel</button><button disabled={loading || !deviceId || (variants.length>0 && !variantId) || (reviewRequired && !reviewed)} className="min-h-11 flex-1 rounded-lg bg-orange-500 font-semibold disabled:opacity-40">Save reserve</button></div></form></Modal>;
}
