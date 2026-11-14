import React,{useCallback,useEffect,useState} from 'react';
import Modal from '../../components/owner/Modal.jsx';
import OfflinePosSetup from '../../components/staff/OfflinePosSetup.jsx';
import {listOfflinePosApprovals,approveOfflinePosDevice,rejectOfflinePosDevice,getMyPermissions} from '../../services/api.js';

export default function OfflinePosDevicesView({user}){
  const [requests,setRequests]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [review,setReview]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0),[canReserve,setCanReserve]=useState(false);
  const management=['owner','admin','super_admin'].includes(user?.role);
  const refresh=useCallback(async()=>{const data=await listOfflinePosApprovals();setRequests(data.requests || []);},[]);
  useEffect(()=>{if(!management)return;void refresh().catch(e=>setError(e.message));const timer=setInterval(()=>{void refresh().catch(e=>setError(e.message));},15000);return()=>clearInterval(timer);},[management,refresh]);
  useEffect(()=>{if(management)void getMyPermissions().then(p=>setCanReserve(p.includes('inventory.adjust'))).catch(e=>setError(e.message));},[management]);
  if(!management)return <p role="alert">Management access is required.</p>;
  const submit=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{
      if(review.action==='approve')await approveOfflinePosDevice(review.row.id);
      else await rejectOfflinePosDevice(review.row.id,reason);
      setNotice(review.action==='approve' ? 'Computer approved. It may now prepare Offline POS. No offline stock was allocated.' : 'Request rejected. The computer may request approval again.');
      setReview(null);await refresh();setRevision(v=>v+1);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <div className="min-w-0 space-y-5 p-4 sm:p-6">
    <header><h1 className="text-2xl font-bold">Offline POS Devices</h1><p className="mt-2 text-sm text-slate-600">Approve computers before staff prepare offline cash sales. Each computer needs a separate stock allocation.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">{notice}</p>}
    <section className="space-y-3 rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Pending approval</h2><h3 className="text-sm font-semibold">Pending Offline POS Requests</h3>
      {!requests.some(r=>r.status==='pending') && <p className="text-sm text-slate-600">No computers waiting for approval.</p>}
      {requests.filter(r=>r.status==='pending').map(row=><article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm"><h3 className="break-words font-semibold">{row.requested_name}</h3><p>Requested by: {row.requested_by_name}</p><p>Requested: {new Date(row.requested_at).toLocaleString()}</p><p>Pending approval</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{setReason('');setReview({action:'approve',row});}} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold">Approve</button><button type="button" disabled={busy} onClick={()=>{setReason('');setReview({action:'reject',row});}} className="min-h-11 rounded-lg border px-4">Reject</button></div></article>)}
    </section>
    <OfflinePosSetup key={revision} managementOnly user={user} capabilities={{can_manage_offline_reserve:canReserve}} offline={{pending:0}} />
    <details className="rounded-lg border bg-white p-4 text-sm"><summary className="min-h-11 cursor-pointer font-semibold">Recent approval decisions</summary>{requests.filter(r=>r.status!=='pending').map(r=><p key={r.id} className="break-words py-2">{r.requested_name} — {r.status} · {new Date(r.reviewed_at || r.requested_at).toLocaleString()}</p>)}</details>
    {review && <Modal isOpen title={review.action==='approve' ? 'Approve Offline POS computer?' : 'Reject Offline POS request?'} onClose={()=>!busy && setReview(null)}><div className="space-y-4 p-4 text-sm"><p className="break-words"><strong>Computer:</strong> {review.row.requested_name}</p><p>Requested by: {review.row.requested_by_name}</p>{review.action==='approve' ? <p>This will allow this computer to prepare Offline POS and receive its own offline stock allocation. Approval does not allocate stock. Existing computers stay active.</p> : <label className="block">Rejection reason (optional)<textarea maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>setReview(null)} className="min-h-11 rounded-lg border px-4">Cancel</button><button type="button" disabled={busy} onClick={submit} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold">{busy ? 'Saving…' : review.action==='approve' ? 'Approve computer' : 'Reject request'}</button></div></div></Modal>}
  </div>;
}
