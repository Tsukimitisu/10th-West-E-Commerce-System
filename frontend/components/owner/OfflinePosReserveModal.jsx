import React,{useEffect,useState} from 'react';
import Modal from './Modal.jsx';
import { getOfflinePosReserves,getProductVariants,saveOfflinePosReserve } from '../../services/api.js';

export default function OfflinePosReserveModal({product,onClose,onSaved}){
  const [variants,setVariants]=useState([]);
  const [reserves,setReserves]=useState([]);
  const [variantId,setVariantId]=useState('');
  const [quantity,setQuantity]=useState('0');
  const [reviewed,setReviewed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;Promise.all([getProductVariants(product.id),getOfflinePosReserves(product.id)]).then(([v,r])=>{if(!active)return;setVariants(v.variants || []);setReserves(r.reserves);setQuantity(String(r.reserves.find(i=>i.variant_id==null)?.target_quantity || 0));}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[product.id]);
  const current=reserves.find(r=>Number(r.variant_id || 0)===Number(variantId || 0));
  const reviewRequired=current?.quarantined || Number(quantity)<Number(current?.remaining || 0);
  const save=async e=>{e.preventDefault();setLoading(true);setError('');try{await saveOfflinePosReserve({product_id:product.id,variant_id:variantId?Number(variantId):null,quantity:Number(quantity),reviewed});await onSaved?.();onClose();}catch(e){setError(e.message);}finally{setLoading(false);}};
  return <Modal isOpen title={`Offline POS reserve — ${product.name || product.product_name}`} onClose={()=>!loading && onClose()}><form onSubmit={save} className="space-y-4 p-4"><p className="text-sm">Quantity protected for in-store cash sales if the internet is unavailable. This reduces online availability without changing physical stock.</p>{variants.length>0 && <label className="block text-sm">Variant<select value={variantId} onChange={e=>{setVariantId(e.target.value);setQuantity(String(reserves.find(r=>Number(r.variant_id)===Number(e.target.value))?.target_quantity || 0));}} className="mt-2 block w-full rounded-lg border p-3"><option value="">Select variant</option>{variants.map(v=><option key={v.id} value={v.id}>{v.variant_type}: {v.variant_value} — {v.sku}</option>)}</select></label>}<label className="block text-sm">Offline POS reserve<input type="number" min={0} max={10000} step={1} required value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label><p className="text-sm">Currently protected: {current?.remaining || 0}. Default: 0. Refresh the POS catalogue after saving.</p>{reviewRequired && <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} />I reviewed physical stock and all pending offline sales before reducing or reassigning this reserve.</label>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button type="button" onClick={onClose} disabled={loading} className="min-h-11 flex-1 rounded-lg border">Cancel</button><button disabled={loading || (variants.length>0 && !variantId) || (reviewRequired && !reviewed)} className="min-h-11 flex-1 rounded-lg bg-orange-500 font-semibold disabled:opacity-40">Save reserve</button></div></form></Modal>;
}
