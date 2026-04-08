import React, { useEffect, useState } from 'react';
import { getReturns, updateReturnStatus } from '../../services/api';
import { RotateCcw, Search, Eye, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import { useSocketEvent } from '../../context/SocketContext';

const statusColors = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  approved: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const ReturnsView = () => {
  const userStr = localStorage.getItem('shopCoreUser');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isStaff = currentUser?.role === 'store_staff';

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailReturn, setDetailReturn] = useState(null);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const data = await getReturns();
      setReturns(Array.isArray(data) ? data : []);
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
    try {
      await updateReturnStatus(ret.id, status);
      await fetchData();
      if (detailReturn?.id === ret.id) {
        setDetailReturn((prev) => prev ? { ...prev, status } : prev);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update return request.');
    }
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

  const pending = returns.filter((ret) => ret.status === 'pending').length;
  const approved = returns.filter((ret) => ret.status === 'approved').length;
  const rejected = returns.filter((ret) => ret.status === 'rejected').length;
  const allStatuses = ['pending', 'approved', 'rejected'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Returns</h1>
          <p className="text-sm text-gray-400">{returns.length} total return requests</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending', value: pending.toString(), icon: <Clock size={18} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Approved', value: approved.toString(), icon: <CheckCircle2 size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Rejected', value: rejected.toString(), icon: <XCircle size={18} />, color: 'bg-red-500/10 text-orange-600' },
          { label: 'Total', value: returns.length.toString(), icon: <RotateCcw size={18} />, color: 'bg-gray-900 text-gray-600' },
        ].map((kpi, index) => (
          <div key={index} className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <p className="text-lg font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search returns..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${!statusFilter ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-[#202430]/60 hover:text-white'}`}>All</button>
            {allStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${statusFilter === status ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-[#202430]/60 hover:text-white'}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-700 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><RotateCcw size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-400">No return requests found</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#202430]/80 border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Return ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Order</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden lg:table-cell">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((ret) => (
                <tr key={ret.id} className="hover:bg-[#202430]/60">
                  <td className="px-4 py-3 font-medium text-white font-mono">RET-{ret.id.toString().padStart(4, '0')}</td>
                  <td className="px-4 py-3 text-white">#{ret.order_id?.toString().padStart(4, '0') || ret.id}</td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                    <div>{ret.customer_name || `User #${ret.user_id}`}</div>
                    {ret.customer_email && <div className="text-xs">{ret.customer_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell max-w-[240px] truncate">{ret.reason || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusColors[ret.status] || 'bg-gray-900 text-gray-600 border-gray-700'}`}>
                      {ret.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{new Date(ret.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetailReturn(ret)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430]/80 text-gray-400 hover:text-blue-300 transition-colors" title="View"><Eye size={14} /></button>
                      {!isStaff && ret.status === 'pending' && (
                        <>
                          <button onClick={() => handleStatusUpdate(ret, 'approved')} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-500/10 text-gray-400 hover:text-green-300 transition-colors" title="Approve"><CheckCircle2 size={14} /></button>
                          <button onClick={() => handleStatusUpdate(ret, 'rejected')} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors" title="Reject"><XCircle size={14} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={!!detailReturn} onClose={() => setDetailReturn(null)} title={`Return RET-${detailReturn?.id?.toString().padStart(4, '0') || ''}`} size="lg">
        {detailReturn && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border capitalize ${statusColors[detailReturn.status] || 'bg-gray-900 text-gray-600 border-gray-700'}`}>{detailReturn.status}</span>
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
            {detailReturn.items?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">Returned Items</h4>
                <div className="border border-gray-700 rounded-lg divide-y divide-gray-50">
                  {detailReturn.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.name || item.product_name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                      </div>
                      <span className="text-sm font-bold">{'\u20B1'}{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isStaff && detailReturn.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => { handleStatusUpdate(detailReturn, 'approved'); setDetailReturn(null); }} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">Approve</button>
                <button onClick={() => { handleStatusUpdate(detailReturn, 'rejected'); setDetailReturn(null); }} className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors">Reject</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReturnsView;

