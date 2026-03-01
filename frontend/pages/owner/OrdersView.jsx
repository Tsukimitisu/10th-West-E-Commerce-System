import React, { useEffect, useState } from 'react';
import { getOrders, getOrderById, updateOrderStatus, processRefund } from '../../services/api';
import { OrderStatus } from '../../types.js';
import { ShoppingCart, Search, Eye, Package, Truck, CheckCircle2, XCircle, Clock, Filter, ChevronDown, ChevronUp, ArrowLeft, Printer, DollarSign, MapPin, User, Calendar, CreditCard, AlertCircle, Undo } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import { useSocketEvent } from '../../context/SocketContext';

const statusColors = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-orange-50 text-orange-700 border-orange-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};
const statusIcons = {
  pending: <Clock size={12} />, paid: <DollarSign size={12} />, preparing: <Package size={12} />,
  shipped: <Truck size={12} />, completed: <CheckCircle2 size={12} />, cancelled: <XCircle size={12} />,
};

const OrdersView = () => {
  // Role check: staff cannot process refunds
  const userStr = localStorage.getItem('shopCoreUser');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isStaff = currentUser?.role === 'store_staff';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refundError, setRefundError] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const fetchOrders = async () => {
    try { const o = await getOrders(); setOrders(o); } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  // Real-time: refresh on new/updated orders
  useSocketEvent('order:new', fetchOrders);
  useSocketEvent('order:updated', fetchOrders);

  const openDetail = async (order) => {
    try {
      const full = await getOrderById(order.id);
      setDetailOrder(full);
    } catch { setDetailOrder(order); }
    setDetailOpen(true);
  };

  const openStatusChange = (order) => {
    setStatusTarget(order);
    setNewStatus(order.status);
    setTrackingNumber(order.tracking_number || '');
    setStatusModalOpen(true);
  };

  const handleStatusUpdate = async () => {
    if (!statusTarget || !newStatus) return;
    try {
      await updateOrderStatus(statusTarget.id, newStatus, trackingNumber || undefined);
      setStatusModalOpen(false);
      fetchOrders();
    } catch (e) { console.error(e); }
  };

  const handleRefund = async () => {
    if (!refundAmount || parseFloat(refundAmount) <= 0) return;
    setRefunding(true);
    try {
      await processRefund(refundOrder.id, { amount: parseFloat(refundAmount), reason: refundReason });
      setShowRefundModal(false);
      setRefundOrder(null);
      setRefundAmount('');
      setRefundReason('');
      fetchOrders();
    } catch (err) {
      console.error('Refund failed:', err);
      setRefundError('Refund failed: ' + (err.message || 'Unknown error'));
      setTimeout(() => setRefundError(''), 5000);
    }
    setRefunding(false);
  };

  const filtered = orders.filter(o => {
    const term = search.toLowerCase();
    const matchSearch = !term || o.id.toString().includes(term) || o.customer_name?.toLowerCase().includes(term) || o.customer_email?.toLowerCase().includes(term);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = Object.values(OrderStatus);
  const pending = orders.filter(o => o.status === 'pending').length;
  const preparing = orders.filter(o => o.status === 'preparing').length;
  const shipped = orders.filter(o => o.status === 'shipped').length;
  const totalRev = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">{orders.length} total orders</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: `₱${totalRev.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: <DollarSign size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Pending', value: pending.toString(), icon: <Clock size={18} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Preparing', value: preparing.toString(), icon: <Package size={18} />, color: 'bg-orange-50 text-orange-600' },
          { label: 'Shipped', value: shipped.toString(), icon: <Truck size={18} />, color: 'bg-purple-50 text-purple-600' },
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
          <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>All</button>
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No orders found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Payment</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Total</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-28">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">#{o.id.toString().padStart(4, '0')}</p>
                    <p className="text-[10px] text-gray-400">{o.items?.length || '—'} items</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-sm text-gray-700">{o.customer_name || o.shipping_name || `User ${o.user_id}`}</p>
                    <p className="text-[10px] text-gray-400">{o.customer_email || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openStatusChange(o)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer hover:opacity-80 ${statusColors[o.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {statusIcons[o.status]} {o.status}
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-gray-500 capitalize">{o.payment_method || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">₱{(o.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openDetail(o)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="View"><Eye size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Order Detail Modal */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={`Order #${detailOrder?.id.toString().padStart(4, '0') || ''}`} size="xl">
        {detailOrder && (
          <div className="space-y-5">
            {/* Status + Date */}
            <div className="flex items-center justify-between p-4 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider ${statusColors[detailOrder.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {statusIcons[detailOrder.status]} {detailOrder.status}
              </span>
              <div className="flex flex-col items-end">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Order Date</p>
                <div className="flex items-center gap-1 text-xs font-bold text-gray-900"><Calendar size={12} className="text-orange-500" /> {new Date(detailOrder.created_at).toLocaleString()}</div>
              </div>
            </div>

            {/* Customer & Shipping */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2"><User size={12} /> Customer</div>
                <p className="text-sm font-medium text-gray-900">{detailOrder.customer_name || detailOrder.shipping_name || `User #${detailOrder.user_id}`}</p>
                <p className="text-xs text-gray-500">{detailOrder.customer_email || ''}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2"><MapPin size={12} /> Shipping Address</div>
                <p className="text-sm text-gray-700">{detailOrder.shipping_address || detailOrder.shipping_line1 || '—'}</p>
                <p className="text-xs text-gray-500">{detailOrder.shipping_city ? `${detailOrder.shipping_city}, ${detailOrder.shipping_state || ''} ${detailOrder.shipping_zip || ''}` : ''}</p>
              </div>
            </div>

            {/* Shipping Method, Tracking & Staff */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2"><Truck size={12} /> Shipping Method</div>
                <p className="text-sm font-medium text-gray-900 capitalize">{detailOrder.shipping_method || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2"><Package size={12} /> Tracking Number</div>
                <p className="text-sm font-medium text-gray-900">{detailOrder.tracking_number || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2"><User size={12} /> Assigned Staff</div>
                <p className="text-sm font-medium text-gray-900">{detailOrder.assigned_staff_id ? `Staff #${detailOrder.assigned_staff_id}` : '—'}</p>
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">Order Items</h4>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 overflow-hidden">
                {detailOrder.items?.length > 0 ? detailOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                        {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="m-auto text-gray-400 mt-2.5" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name || item.product_name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900">₱{((item.price || 0) * (item.quantity || 1)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                )) : <div className="p-4 text-center text-xs text-gray-400">No item details available</div>}
              </div>
            </div>

            {/* Totals */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₱{(detailOrder.subtotal || detailOrder.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              {detailOrder.tax > 0 && <div className="flex justify-between text-gray-500"><span>Tax</span><span>₱{detailOrder.tax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>}
              {detailOrder.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₱{detailOrder.discount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200"><span>Total</span><span>₱{(detailOrder.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setDetailOpen(false); openStatusChange(detailOrder); }}
                className="flex-1 min-w-[140px] px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
              >
                Update Status
              </button>
              <button
                onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/orders/${detailOrder.id}/invoice`, '_blank')}
                className="flex-1 min-w-[140px] px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Print Invoice
              </button>
              {!isStaff && (detailOrder.status === 'completed' || detailOrder.status === 'cancelled') && (
                <button onClick={() => { setRefundOrder(detailOrder); setRefundAmount(detailOrder.total_amount); setShowRefundModal(true); }}
                  className="px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-sm font-medium flex items-center gap-1">
                  <Undo size={14} /> Process Refund
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Status Update Modal */}
      <Modal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} title="Update Order Status" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <span className="text-gray-500">Order </span><span className="font-bold text-gray-900">#{statusTarget?.id.toString().padStart(4, '0')}</span>
            <span className="text-gray-500"> — Current: </span><span className={`font-semibold capitalize ${statusTarget?.status === 'completed' ? 'text-green-600' : 'text-gray-900'}`}>{statusTarget?.status}</span>
          </div>
          <div className="space-y-1.5">
            {statuses.map(s => (
              <button key={s} onClick={() => setNewStatus(s)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all capitalize ${newStatus === s ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                {statusIcons[s]} {s}
              </button>
            ))}
          </div>
          {newStatus === 'shipped' && (
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <label className="block text-xs font-medium text-orange-700 mb-1.5">Tracking Number</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number..."
                className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setStatusModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleStatusUpdate} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">Update Status</button>
          </div>
        </div>
      </Modal>

      {/* Refund Modal — owner only */}
      {!isStaff && showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Process Refund - Order #{refundOrder?.id}</h3>
            {refundError && (
              <div className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
                <AlertCircle size={14} /> {refundError}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Refund Amount ({'\u20B1'})</label>
                <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                  max={refundOrder?.total_amount} min="0" step="0.01"
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500" />
                <p className="text-xs text-gray-400 mt-1">Order total: {'\u20B1'}{refundOrder?.total_amount?.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Reason</label>
                <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                  rows={3} placeholder="Reason for refund..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowRefundModal(false); setRefundOrder(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button onClick={handleRefund} disabled={refunding || !refundAmount}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">
                {refunding ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersView;
