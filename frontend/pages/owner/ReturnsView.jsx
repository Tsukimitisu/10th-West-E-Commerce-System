import React, { useEffect, useState, useRef } from 'react';
import { getReturns, updateReturnStatus, markReturnReceived, processRefund, getMyPermissions } from '../../services/api';
import { RotateCcw, Eye, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import { useSocketEvent } from '../../context/SocketContext';
import PageHeader from '../../components/operations/PageHeader';
import DataToolbar, { FilterSelect } from '../../components/operations/DataToolbar';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';

import { returnLabels } from '../../utils/returnStatus.js';

const statusColors = {
  received: 'bg-slate-100 text-slate-700 border-slate-200',
  refund_processing: 'bg-orange-50 text-orange-800 border-orange-200',
  refunded: 'bg-green-50 text-green-800 border-green-200',
  manual_review: 'bg-amber-50 text-amber-800 border-amber-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const ReturnsView = () => {
  const [permissions, setPermissions] = useState(new Set());
  const canManage = permissions.has('returns.manage');
  const canRefund = permissions.has('refunds.process');
  const [manualReference, setManualReference] = useState('');
  const refundKeys = useRef(new Map());
  useEffect(() => { getMyPermissions().then(list => setPermissions(new Set(list))).catch(() => {}); }, []);

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailReturn, setDetailReturn] = useState(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState(null);
  const [savingDecision, setSavingDecision] = useState(false);

  const fetchData = async () => {
    try {
      const data = await getReturns();
      setReturns(Array.isArray(data) ? data : []);
      setDetailReturn(prev => prev ? data.find?.(item => item.id === prev.id) || prev : null);
      setError('');
    } catch (err) {
      console.error(err);
      setReturns([]);
      setError(err.message || 'Failed to load return requests.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useSocketEvent('return:new', fetchData);
  useSocketEvent('return:updated', fetchData);

  const handleStatusUpdate = async (ret, status) => {
    setSavingDecision(true);
    try {
      if (status === 'received') await markReturnReceived(ret.id);
      else if (status === 'refunded') {
        if (!refundKeys.current.has(ret.id)) refundKeys.current.set(ret.id, crypto.randomUUID());
        const result = await processRefund(ret.id, { manual_reference: manualReference.trim() }, refundKeys.current.get(ret.id));
        if (result.status !== 'succeeded') throw new Error('Refund is processing. Refresh the request before taking further action.');
      } else await updateReturnStatus(ret.id, status);
      await fetchData();
      if (detailReturn?.id === ret.id) {
        setDetailReturn((prev) => prev ? { ...prev, status } : prev);
      }
      setDecision(null);
    } catch (err) {
      console.error(err);
      await fetchData();
      setError(err.message || 'Failed to update return request.');
    }
    setSavingDecision(false);
  };

  const filtered = returns.filter((ret) => {
    const term = search.toLowerCase();
    const matchSearch = !term
      || ret.id.toString().includes(term)
      || ret.order_id?.toString().includes(term)
      || ret.reason?.toLowerCase().includes(term)
      || ret.customer_name?.toLowerCase().includes(term)
      || ret.customer_email?.toLowerCase().includes(term);
    const matchStatus = !statusFilter || ret.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const allStatuses = Object.keys(returnLabels);

  return (
    <div className="space-y-4">
      <PageHeader title="Returns & refunds" description={loading ? 'Review the reason, decision, and refund progress.' : `${returns.length} requests · Review the reason, decision, and refund progress.`} />

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="ops-inline-kpis">
        {[
          ...allStatuses.map(status => ({ label: returnLabels[status], value: String(returns.filter(ret => ret.status === status).length), icon: <RotateCcw size={18} /> })),
        ].map((kpi, index) => (
          <div key={index} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-8 h-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <div className="min-h-7 text-lg font-bold text-white">{loading ? <LoadingSkeleton className="h-6 w-16" /> : error ? '—' : kpi.value}</div>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      <DataToolbar search={search} onSearchChange={event => setSearch(event.target.value)} searchPlaceholder="Search returns…" label="Return request filters"><FilterSelect label="Request status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All requests</option>{allStatuses.map(status => <option key={status} value={status}>{returnLabels[status]}</option>)}</FilterSelect></DataToolbar>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading returns">{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6"><EmptyState icon={RotateCcw} title="No return requests found" description={search || statusFilter ? 'Try different filters.' : 'New requests will appear here for review.'} /></div>
        ) : (
          <><div className="divide-y divide-slate-200 md:hidden">{filtered.map((ret) => <article key={ret.id} className="space-y-2 p-4 text-sm">
            <div className="flex items-start justify-between gap-3"><strong className="text-slate-950">Return #{ret.id} · Order #{ret.order_id}</strong><span className="capitalize text-slate-700">{returnLabels[ret.status] || ret.status}</span></div>
            <p className="text-slate-700">{ret.customer_name || `User #${ret.user_id}`}</p><p className="line-clamp-2 text-slate-600">{ret.reason || 'No reason provided'}</p>
            <p className="text-xs text-slate-600">Refund requested: ₱{Number(ret.refund_amount || 0).toLocaleString('en-PH')} · {ret.created_at ? new Date(ret.created_at).toLocaleDateString() : 'Date unavailable'}</p>
            <button type="button" onClick={() => { setDetailReturn(ret); setManualReference(''); }} className="min-h-11 rounded-lg border border-slate-300 px-3 font-semibold text-slate-700">Review request</button>
          </article>)}</div><table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="bg-gray-50/80 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Return ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Order</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden lg:table-cell">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((ret) => (
                <tr key={ret.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-white font-mono">RET-{ret.id.toString().padStart(4, '0')}</td>
                  <td className="px-4 py-3 text-gray-600">#{ret.order_id?.toString().padStart(4, '0') || ret.id}</td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                    <div>{ret.customer_name || `User #${ret.user_id}`}</div>
                    {ret.customer_email && <div className="text-xs">{ret.customer_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell max-w-[240px] truncate">{ret.reason || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusColors[ret.status] || 'bg-gray-900 text-gray-600 border-slate-200'}`}>
                      {returnLabels[ret.status] || ret.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{new Date(ret.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setDetailReturn(ret); setManualReference(''); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="View"><Eye size={14} /></button>
                      {canManage && ret.status === 'pending' && (
                        <>
                          <button aria-label={`Approve return ${ret.id}`} onClick={() => setDecision({ ret, status: 'approved' })} className="grid h-9 w-9 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50" title="Approve"><CheckCircle2 size={16} /></button>
                          <button aria-label={`Reject return ${ret.id}`} onClick={() => setDecision({ ret, status: 'rejected' })} className="grid h-9 w-9 place-items-center rounded-lg text-red-700 hover:bg-red-50" title="Reject"><XCircle size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></>
        )}
      </div>

      <Modal isOpen={!!detailReturn && !decision} onClose={() => setDetailReturn(null)} title={`Return RET-${detailReturn?.id?.toString().padStart(4, '0') || ''}`} size="lg">
        {detailReturn && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border capitalize ${statusColors[detailReturn.status] || 'bg-gray-900 text-gray-600 border-slate-200'}`}>{returnLabels[detailReturn.status] || detailReturn.status}</span>
              <span className="text-xs text-gray-400">{new Date(detailReturn.created_at).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Order ID</p>
                <p className="text-sm font-medium text-white">#{detailReturn.order_id?.toString().padStart(4, '0') || '-'}</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Customer</p>
                <p className="text-sm font-medium text-white">{detailReturn.customer_name || `User #${detailReturn.user_id}`}</p>
              </div>
            </div>
            {(detailReturn.reviewed_by_name || detailReturn.reviewed_at) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Reviewed By</p>
                  <p className="text-sm font-medium text-white">{detailReturn.reviewed_by_name || `User #${detailReturn.reviewed_by}`}</p>
                </div>
                <div className="p-3 bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Reviewed At</p>
                  <p className="text-sm font-medium text-white">{detailReturn.reviewed_at ? new Date(detailReturn.reviewed_at).toLocaleString() : '-'}</p>
                </div>
              </div>
            )}
            <div className="p-3 bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Reason</p>
              <p className="text-sm text-white whitespace-pre-wrap">{detailReturn.reason || 'No reason provided'}</p>
            </div>
            <dl className="grid gap-3 border-y border-slate-200 py-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-600">Refund amount requested</dt><dd className="font-semibold text-slate-950">₱{Number(detailReturn.refund_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</dd></div>
              <div><dt className="text-slate-600">Refund payment status</dt><dd className="font-semibold capitalize text-slate-950">{detailReturn.refund_status || 'Not processed'}</dd></div>
            </dl>
            <ol className="space-y-1 text-xs text-slate-600" aria-label="Return history"><li>Requested: {detailReturn.created_at ? new Date(detailReturn.created_at).toLocaleString() : 'Date unavailable'}</li>{detailReturn.reviewed_at && <li>Reviewed by {detailReturn.reviewed_by_name || 'staff'}: {new Date(detailReturn.reviewed_at).toLocaleString()}</li>}</ol>
            {detailReturn.items?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">Returned Items</h4>
                <div className="border border-slate-200 rounded-lg divide-y divide-gray-50">
                  {detailReturn.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.name || item.product_name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                      </div>
                      <span className="text-sm font-bold">₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailReturn.status === 'approved' && <div className="space-y-3 text-sm"><p>Ask the customer to return the approved items to the shop. No refund or stock restoration has occurred.</p>{canManage && <button disabled={savingDecision} onClick={() => setDecision({ ret: detailReturn, status: 'received' })} className="min-h-11 rounded-lg bg-orange-600 px-4 font-semibold text-white">Mark item as received</button>}</div>}
            {detailReturn.status === 'received' && canRefund && <div className="space-y-3 text-sm">
              <p>Refund preference: {detailReturn.refund_method === 'store_credit' ? 'Store credit' : 'Original payment method'}</p>
              {detailReturn.payment_method === 'cod' && detailReturn.refund_method !== 'store_credit' && <label className="block">Cash refund reference / receipt note<input value={manualReference} maxLength={200} onChange={e => setManualReference(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border p-3" /></label>}
              <button disabled={savingDecision || (detailReturn.payment_method === 'cod' && detailReturn.refund_method !== 'store_credit' && !manualReference.trim())} onClick={() => setDecision({ ret: detailReturn, status: 'refunded' })} className="min-h-11 rounded-lg bg-orange-600 px-4 font-semibold text-white">Process refund</button>
            </div>}
            {detailReturn.status === 'manual_review' && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Refund requires review. Check the payment provider and refund audit history with an authorized administrator before taking further action. No automatic retry is available here.</p>}
            {detailReturn.status === 'refund_processing' && <p role="status" className="text-sm">Refund processing. A second refund cannot be started.</p>}
            {canManage && detailReturn.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => setDecision({ ret: detailReturn, status: 'approved' })} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Approve</button>
                <button onClick={() => setDecision({ ret: detailReturn, status: 'rejected' })} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white">Reject</button>
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal isOpen={Boolean(decision)} onClose={() => !savingDecision && setDecision(null)} title={decision?.status === 'received' ? 'Confirm physical receipt' : decision?.status === 'refunded' ? 'Confirm refund' : `${decision?.status === 'approved' ? 'Approve' : 'Reject'} return request`} size="sm">
        {decision && <div className="space-y-4 text-sm">{error && <p role="alert" className="text-red-700">{error}</p>}<p className="text-slate-700">{decision.status === 'received' ? 'Confirm the approved items and quantities were physically received and checked at the shop. This does not refund or restore stock.' : decision.status === 'refunded' ? 'Process the server-calculated refund for the received items? Stock is restored only after successful refund finalization.' : `Confirm ${decision.status === 'approved' ? 'approval' : 'rejection'} of this return request.`}</p><div className="flex gap-3"><button type="button" onClick={() => setDecision(null)} disabled={savingDecision} className="min-h-11 flex-1 rounded-lg border border-slate-300 font-semibold text-slate-700">Cancel</button><button type="button" onClick={() => handleStatusUpdate(decision.ret, decision.status)} disabled={savingDecision} className="min-h-11 flex-1 rounded-lg bg-orange-600 px-3 font-semibold text-white">{savingDecision ? 'Saving...' : 'Confirm'}</button></div></div>}
      </Modal>
    </div>
  );
};

export default ReturnsView;
