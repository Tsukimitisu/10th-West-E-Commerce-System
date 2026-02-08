import React, { useEffect, useState } from 'react';
import { getReturns, updateReturnStatus, processRefund } from '../../services/api';
import { RotateCcw, Search, Eye, CheckCircle2, XCircle, Clock, DollarSign, Package, AlertCircle, Truck } from 'lucide-react';
import Modal from '../../components/admin/Modal';
import { useSocketEvent } from '../../context/SocketContext';

const statusColors = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  received: 'bg-purple-50 text-purple-700 border-purple-200',
  refunded: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
};

const ReturnsView = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailReturn, setDetailReturn] = useState(null);
  const [refundModal, setRefundModal] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('original');

  const fetchData = async () => {
    try {
      const data = await getReturns();
      setReturns(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); setReturns([]); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Real-time: refresh on return events
  useSocketEvent('return:new', fetchData);
  useSocketEvent('return:updated', fetchData);

  const handleStatusUpdate = async (ret, status) => {
    try {
      await updateReturnStatus(ret.id, status);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    if (!refundTarget) return;
    try {
      await processRefund(refundTarget.id, refundMethod);
      setRefundModal(false); fetchData();
    } catch (e) { console.error(e); }
  };

  const openRefund = (ret) => {
    setRefundTarget(ret);
    setRefundAmount((ret.refund_amount || ret.total || 0).toString());
    setRefundMethod('original');
    setRefundModal(true);
  };

  const filtered = returns.filter(r => {
    const term = search.toLowerCase();
    const matchSearch = !term || r.id.toString().includes(term) || r.order_id?.toString().includes(term) || r.reason?.toLowerCase().includes(term);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pending = returns.filter(r => r.status === 'pending').length;
  const approved = returns.filter(r => r.status === 'approved').length;

  const allStatuses = ['pending', 'approved', 'rejected', 'received', 'refunded', 'completed'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Returns & Refunds</h1>
          <p className="text-sm text-gray-500">{returns.length} total return requests</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending Review', value: pending.toString(), icon: <Clock size={18} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Approved', value: approved.toString(), icon: <CheckCircle2 size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Total Returns', value: returns.length.toString(), icon: <RotateCcw size={18} />, color: 'bg-gray-50 text-gray-600' },
          { label: 'Total Refunded', value: `₱${returns.filter(r => r.status === 'refunded' || r.status === 'completed').reduce((s, r) => s + (r.refund_amount || 0), 0).toLocaleString()}`, icon: <DollarSign size={18} />, color: 'bg-green-50 text-green-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search returns..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>All</button>
          {allStatuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><RotateCcw size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">No return requests found</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Return ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Reason</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Date</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-40">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900 font-mono">RET-{r.id.toString().padStart(4, '0')}</td>
                  <td className="px-4 py-3 text-gray-600">#{r.order_id?.toString().padStart(4, '0') || r.id}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-[200px] truncate">{r.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusColors[r.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetailReturn(r)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="View"><Eye size={14} /></button>
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => handleStatusUpdate(r, 'approved')} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors" title="Approve"><CheckCircle2 size={14} /></button>
                          <button onClick={() => handleStatusUpdate(r, 'rejected')} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Reject"><XCircle size={14} /></button>
                        </>
                      )}
                      {(r.status === 'approved' || r.status === 'received') && (
                        <button onClick={() => openRefund(r)} className="px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-semibold rounded-lg transition-colors">Refund</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      <Modal isOpen={!!detailReturn} onClose={() => setDetailReturn(null)} title={`Return RET-${detailReturn?.id.toString().padStart(4, '0') || ''}`} size="lg">
        {detailReturn && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border capitalize ${statusColors[detailReturn.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>{detailReturn.status}</span>
              <span className="text-xs text-gray-500">{new Date(detailReturn.created_at).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Order ID</p>
                <p className="text-sm font-medium text-gray-900">#{detailReturn.order_id?.toString().padStart(4, '0') || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Customer</p>
                <p className="text-sm font-medium text-gray-900">User #{detailReturn.user_id}</p>
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Reason</p>
              <p className="text-sm text-gray-900">{detailReturn.reason || 'No reason provided'}</p>
            </div>
            {detailReturn.items?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2">Returned Items</h4>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {detailReturn.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name || item.product_name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                      </div>
                      <span className="text-sm font-bold">₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {detailReturn.status === 'pending' && (
                <>
                  <button onClick={() => { handleStatusUpdate(detailReturn, 'approved'); setDetailReturn(null); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">Approve</button>
                  <button onClick={() => { handleStatusUpdate(detailReturn, 'rejected'); setDetailReturn(null); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">Reject</button>
                </>
              )}
              {(detailReturn.status === 'approved' || detailReturn.status === 'received') && (
                <button onClick={() => { setDetailReturn(null); openRefund(detailReturn); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"><DollarSign size={12} /> Process Refund</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Refund Modal */}
      <Modal isOpen={refundModal} onClose={() => setRefundModal(false)} title="Process Refund" size="sm">
        <form onSubmit={handleRefund} className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <span className="text-gray-500">Return </span><span className="font-bold text-gray-900">RET-{refundTarget?.id.toString().padStart(4, '0')}</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Refund Amount (₱)</label>
            <input type="number" step="0.01" min="0" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Refund Method</label>
            <div className="space-y-1.5">
              {[
                { id: 'original', label: 'Original Payment Method' },
                { id: 'store_credit', label: 'Store Credit' },
                { id: 'exchange', label: 'Exchange' },
              ].map(m => (
                <button key={m.id} type="button" onClick={() => setRefundMethod(m.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${refundMethod === m.id ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'}`}>{m.label}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRefundModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">Process Refund</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ReturnsView;
