import React, { useEffect, useState } from 'react';
import { getOrders, getOrderById, getShipmentTracking, updateShipmentStatus, updateOrderStatus, confirmOrderDelivery, processRefund, createManualWaybill, cancelOrder, getMyPermissions } from '../../services/api';
import { OrderStatus } from '../../types.js';
import { ShoppingCart, Search, Eye, Package, Truck, CheckCircle2, XCircle, Clock, Filter, ChevronDown, ChevronUp, ArrowLeft, Printer, DollarSign, MapPin, User, Calendar, CreditCard, AlertCircle, Undo } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import { useSocketEvent } from '../../context/SocketContext';
import { getCurrentAuthUser } from '../../services/authSession';
import PageHeader from '../../components/operations/PageHeader';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import { API_URL } from '../../services/apiConfig.js';

const statusColors = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-red-500/10 text-orange-700 border-red-200',
  packed: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ready_for_pickup: 'bg-teal-50 text-teal-700 border-teal-200',
  shipped: 'bg-purple-50 text-purple-700 border-purple-200',
  out_for_delivery: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  refund_processing: 'bg-orange-50 text-orange-700 border-orange-200',
  refunded: 'bg-green-50 text-green-700 border-green-200',
  partially_refunded: 'bg-lime-50 text-lime-700 border-lime-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};
const statusIcons = {
  pending: <Clock size={12} />, payment_pending: <Clock size={12} />, paid: <DollarSign size={12} />, processing: <Package size={12} />,
  packed: <Package size={12} />, ready_for_pickup: <Package size={12} />, shipped: <Truck size={12} />, out_for_delivery: <Truck size={12} />,
  delivered: <CheckCircle2 size={12} />, cancelled: <XCircle size={12} />, failed: <XCircle size={12} />,
};

const staffStatusTransitions = {
  pending: ['processing', 'cancelled'],
  payment_pending: ['cancelled'],
  paid: ['processing'],
  processing: ['packed', 'cancelled'],
  packed: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: [],
  delivered: [],
  cancelled: [],
  failed: [],
};

const shipmentStatusOptions = [
  ['picked_up', 'Picked Up'],
  ['in_transit', 'In Transit'],
  ['out_for_delivery', 'Out for Delivery'],
  ['delivered', 'Delivered'],
  ['failed', 'Delivery Failed'],
  ['returned', 'Returned'],
  ['cancelled', 'Cancelled'],
];

const getOrderStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'failed') return 'Payment Failed';
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

const getShipmentStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'failed') return 'Delivery Failed';
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

const PAYMENT_FAILED_HELP = 'Payment Failed: payment was not completed or was rejected.';
const DELIVERY_FAILED_HELP = 'Delivery Failed: courier/store could not complete delivery.';

const OrdersView = () => {
  // Role check: staff cannot process refunds
  const currentUser = getCurrentAuthUser();
  const isStaff = currentUser?.role === 'store_staff';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refundError, setRefundError] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const [shipmentData, setShipmentData] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [statusError, setStatusError] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [waybillBusy, setWaybillBusy] = useState(false);
  const [permissions, setPermissions] = useState(new Set());
  const [waybillModalOpen, setWaybillModalOpen] = useState(false);
  const [waybillForm, setWaybillForm] = useState({
    waybill_number: '', tracking_number: '', service_type: 'standard', notes: '',
  });
  const [shipmentStatus, setShipmentStatus] = useState('picked_up');
  const [shipmentStatusBusy, setShipmentStatusBusy] = useState(false);

  const fetchOrders = async () => {
    try { const o = await getOrders(); setOrders(o); } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    getMyPermissions().then((items) => setPermissions(new Set(items))).catch(() => setPermissions(new Set()));
  }, []);

  // Real-time: refresh on new/updated orders
  useSocketEvent('order:new', fetchOrders);
  useSocketEvent('order:updated', fetchOrders);

  const openDetail = async (order) => {
    setShipmentData(null);
    try {
      const [full, shipment] = await Promise.all([
        getOrderById(order.id),
        getShipmentTracking(order.id).catch(() => null),
      ]);
      setDetailOrder(full);
      setShipmentData(shipment);
      if (shipment?.shipment?.status) {
        setShipmentStatus(shipment.shipment.status === 'waybill_created' ? 'picked_up' : shipment.shipment.status);
      }
    } catch { setDetailOrder(order); }
    setDetailOpen(true);
  };

  const openStatusChange = (order) => {
    const nextOptions = staffStatusTransitions[order.status] || [];
    setStatusTarget(order);
    setNewStatus(nextOptions[0] || '');
    setTrackingNumber(order.tracking_number || '');
    setCancelReason('');
    setStatusError('');
    setStatusModalOpen(true);
  };

  const handleStatusUpdate = async () => {
    if (!statusTarget || !newStatus) return;
    if (newStatus === 'cancelled' && !cancelReason.trim()) return;
    setStatusError('');

    try {
      if (newStatus === 'cancelled') {
        await cancelOrder(statusTarget.id, cancelReason.trim());
      } else {
        await updateOrderStatus(statusTarget.id, newStatus, trackingNumber || undefined);
      }
      setStatusModalOpen(false);
      fetchOrders();
    } catch (e) {
      console.error(e);
      setStatusError(e.message || 'Failed to update status.');
    }
  };

  const handleRiderDeliveryConfirm = async () => {
    if (!statusTarget) return;
    setStatusError('');

    try {
      await confirmOrderDelivery(statusTarget.id);
      setStatusModalOpen(false);
      fetchOrders();
    } catch (e) {
      console.error(e);
      setStatusError(e.message || 'Failed to confirm delivery.');
    }
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

  const handleCreateWaybill = async () => {
    if (!detailOrder) return;
    setStatusError('');
    setWaybillBusy(true);
    try {
      const created = await createManualWaybill(detailOrder.id, waybillForm);
      const full = await getOrderById(detailOrder.id);
      setDetailOrder(full);
      setShipmentData(created);
      setShipmentStatus(created?.shipment?.status === 'waybill_created' ? 'picked_up' : (created?.shipment?.status || 'picked_up'));
      setWaybillModalOpen(false);
      setWaybillForm({ waybill_number: '', tracking_number: '', service_type: 'standard', notes: '' });
      fetchOrders();
    } catch (e) {
      setStatusError(e.message || 'The manual J&T waybill could not be created.');
    } finally {
      setWaybillBusy(false);
    }
  };

  const handleShipmentStatusUpdate = async () => {
    if (!shipmentData?.shipment?.id) return;
    setStatusError('');
    setShipmentStatusBusy(true);
    try {
      const updated = await updateShipmentStatus(shipmentData.shipment.id, { status: shipmentStatus });
      setShipmentData(updated);
      const full = await getOrderById(detailOrder.id);
      setDetailOrder(full);
      fetchOrders();
    } catch (e) {
      setStatusError(e.message || 'Shipment status could not be updated.');
    } finally {
      setShipmentStatusBusy(false);
    }
  };

  const filtered = orders.filter(o => {
    const term = search.toLowerCase();
    const matchSearch = !term
      || o.id.toString().includes(term)
      || o.customer_display_name?.toLowerCase().includes(term)
      || o.customer_name?.toLowerCase().includes(term)
      || o.customer_email?.toLowerCase().includes(term);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = Object.values(OrderStatus);
  const nextStatusOptions = statusTarget ? (staffStatusTransitions[statusTarget.status] || []) : [];
  const pending = orders.filter(o => o.status === 'pending').length;
  const processing = orders.filter(o => ['processing', 'packed', 'ready_for_pickup'].includes(o.status)).length;
  const shipped = orders.filter(o => o.status === 'shipped').length;
  const totalRev = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const privileged = ['admin', 'owner', 'super_admin'].includes(currentUser?.role);
  const canManageShipments = privileged || permissions.has('shipments.manage');
  const activeShipment = shipmentData?.shipment
    && !['cancelled', 'returned'].includes(shipmentData.shipment.status);
  const waybillEligible = detailOrder
    && detailOrder.shipping_method !== 'pickup'
    && detailOrder.source !== 'pos'
    && ['paid', 'processing', 'packed', 'ready_for_pickup'].includes(detailOrder.status);
  const canCreateWaybill = canManageShipments && waybillEligible && !activeShipment;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Sales operations" title="Order management" description={`${orders.length} orders · Review payment, fulfillment, courier, delivery, and refund state.`} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: `₱${totalRev.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: <DollarSign size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Pending', value: pending.toString(), icon: <Clock size={18} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Processing', value: processing.toString(), icon: <Package size={18} />, color: 'bg-red-500/10 text-orange-600' },
          { label: 'Shipped', value: shipped.toString(), icon: <Truck size={18} />, color: 'bg-purple-50 text-purple-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <p className="text-lg font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] lg:items-start" data-testid="staff-orders-filters">
        <div className="relative w-full min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-900'}`}>All</button>
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} title={s === 'failed' ? PAYMENT_FAILED_HELP : undefined} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-900'}`}>{getOrderStatusLabel(s)}</button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-700 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No orders found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/80 border-b border-gray-700">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Payment</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Total</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-28">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">#{o.id.toString().padStart(4, '0')}</p>
                    <p className="text-[10px] text-gray-400">{o.items?.length || '-'} items</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-sm text-gray-700">{o.customer_display_name || 'Customer unavailable'}</p>
                    <p className="text-[10px] text-gray-400">{o.customer_email || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openStatusChange(o)} title={o.status === 'failed' ? PAYMENT_FAILED_HELP : undefined} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer hover:opacity-80 ${statusColors[o.status] || 'bg-gray-900 text-gray-600 border-gray-700'}`}>
                      {statusIcons[o.status]} {getOrderStatusLabel(o.status)}
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-gray-400 capitalize">{o.payment_method || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white">₱{(o.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider ${statusColors[detailOrder.status] || 'bg-gray-900 text-gray-600 border-gray-700'}`}>
                {statusIcons[detailOrder.status]} {getOrderStatusLabel(detailOrder.status)}
              </span>
              <div className="flex flex-col items-end">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Order Date</p>
                <div className="flex items-center gap-1 text-xs font-bold text-white"><Calendar size={12} className="text-red-500" /> {new Date(detailOrder.created_at).toLocaleString()}</div>
              </div>
            </div>

            {/* Customer & Shipping */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><User size={12} /> Customer</div>
                <p className="text-sm font-medium text-white">{detailOrder.customer_display_name || 'Customer unavailable'}</p>
                <p className="text-xs text-gray-400">{detailOrder.customer_email || ''}</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><MapPin size={12} /> Shipping Address</div>
                  <div className="text-sm text-gray-300">
                    {detailOrder.shipping_address ? (
                      detailOrder.shipping_address.split(', ').map((part, index) => (
                        <div key={index}>{part}</div>
                      ))
                    ) : (
                      <span className="text-gray-500">No address provided</span>
                    )}
                  </div>
              </div>
            </div>

            {/* Shipping Method, Tracking & Staff */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><Truck size={12} /> Shipping Method</div>
                <p className="text-sm font-medium text-white capitalize">{detailOrder.shipping_method || '-'}</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><Package size={12} /> Tracking Number</div>
                <p className="text-sm font-medium text-white">{shipmentData?.shipment?.tracking_number || detailOrder.tracking_number || '-'}</p>
                <p className="text-[10px] text-gray-400 mt-1">Waybill: {shipmentData?.shipment?.waybill_number || detailOrder.waybill_number || 'not created'}</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><Truck size={12} /> Courier</div>
                <p className="text-sm font-medium text-white">{shipmentData?.shipment?.courier_name || detailOrder.courier_name || 'J&T Express'}</p>
                <p className="text-[10px] text-gray-400 mt-1 capitalize">{String(shipmentData?.shipment?.status || detailOrder.shipping_status || 'pending').replaceAll('_', ' ')}</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2"><User size={12} /> Assigned Staff</div>
                <p className="text-sm font-medium text-white">{detailOrder.assigned_staff_id ? `Staff #${detailOrder.assigned_staff_id}` : '-'}</p>
              </div>
            </div>

            {detailOrder.status === 'failed' && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{PAYMENT_FAILED_HELP}</p>
            )}

            {shipmentData?.shipment && (
              <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-gray-400">Created</p><p className="font-medium text-white">{new Date(shipmentData.shipment.created_at).toLocaleString('en-PH')}</p></div>
                  <div><p className="text-xs text-gray-400">Created By</p><p className="font-medium text-white">{shipmentData.shipment.created_by?.name || (shipmentData.shipment.created_by?.id ? `User #${shipmentData.shipment.created_by.id}` : '-')}</p></div>
                  <div><p className="text-xs text-gray-400">Service</p><p className="font-medium text-white capitalize">{shipmentData.shipment.service_type || 'standard'}</p></div>
                </div>
                {shipmentData.events?.length > 0 && (
                  <ol className="space-y-3 border-l border-gray-600 pl-4">
                    {shipmentData.events.map((event, index) => (
                      <li key={`${event.event_time || event.occurred_at}-${index}`}>
                        <p className="text-sm font-medium text-white">{getShipmentStatusLabel(event.status)}</p>
                        {event.description && <p className="text-xs text-gray-300">{event.description}</p>}
                        <p className="text-[10px] text-gray-500">{[event.location, new Date(event.event_time || event.occurred_at).toLocaleString('en-PH')].filter(Boolean).join(' · ')}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {canManageShipments && activeShipment && (
                  <div className="border-t border-gray-700 pt-4">
                    <p className="mb-2 text-xs text-gray-300">{DELIVERY_FAILED_HELP}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={shipmentStatus}
                      onChange={(event) => setShipmentStatus(event.target.value)}
                      className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                    >
                      {shipmentStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={handleShipmentStatusUpdate}
                      disabled={shipmentStatusBusy}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-500"
                    >
                      {shipmentStatusBusy ? 'Updating...' : 'Update Shipment Status'}
                    </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cancellation Reason */}
            {detailOrder.status === 'cancelled' && detailOrder.cancellation_reason && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 text-xs font-medium text-red-600 mb-1"><XCircle size={12} /> Cancellation Reason</div>
                <p className="text-sm text-red-700">{detailOrder.cancellation_reason}</p>
              </div>
            )}

            {/* Items */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">Order Items</h4>
              <div className="border border-gray-700 rounded-lg divide-y divide-gray-50 overflow-hidden">
                {detailOrder.items?.length > 0 ? detailOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700">
                        {item.image_url || item.product?.image ? <img src={resolveProductImageUrl(item.image_url || item.product.image)} alt={item.name || 'Ordered product'} onError={handleProductImageError} className="w-full h-full object-cover" /> : <Package size={14} className="m-auto mt-2.5 text-gray-400" aria-label="Product image unavailable" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{item.name || item.product_name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity} · Unit: ₱{Number(item.unit_price || item.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white">₱{Number(item.line_total ?? ((item.unit_price || item.price || 0) * (item.quantity || 1))).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                )) : <div className="p-4 text-center text-xs text-gray-400">No item details available</div>}
              </div>
            </div>

            {/* Totals */}
            <div className="p-4 bg-gray-900 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>₱{(detailOrder.subtotal || detailOrder.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-gray-400"><span>Shipping Fee</span><span>₱{(detailOrder.shipping || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              {detailOrder.tax > 0 && <div className="flex justify-between text-gray-400"><span>Tax</span><span>₱{detailOrder.tax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>}
              {detailOrder.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₱{detailOrder.discount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>}
              <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-gray-700"><span>Total</span><span>₱{(detailOrder.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
              {statusError && (
                <div className="basis-full p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
                  {statusError}
                </div>
              )}
              <button
                onClick={() => { setDetailOpen(false); openStatusChange(detailOrder); }}
                className="flex-1 min-w-[140px] px-4 py-2.5 bg-red-500/100 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
              >
                Update Status
              </button>
              <button
                onClick={() => window.open(`${API_URL}/orders/${detailOrder.id}/invoice`, '_blank')}
                className="flex-1 min-w-[140px] px-4 py-2.5 bg-gray-800 border border-gray-700 hover:bg-gray-900 text-gray-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Print Invoice
              </button>
              {canCreateWaybill && (
                <button
                  onClick={() => { setStatusError(''); setWaybillModalOpen(true); }}
                  className="flex-1 min-w-[140px] px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Truck size={14} /> Create J&T Waybill
                </button>
              )}
              {!isStaff && (['delivered', 'refunded', 'partially_refunded', 'cancelled'].includes(detailOrder.status)) && (
                <button onClick={() => { setRefundOrder(detailOrder); setRefundAmount(detailOrder.total_amount); setShowRefundModal(true); }}
                  className="px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-sm font-medium flex items-center gap-1">
                  <Undo size={14} /> Process Refund
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={waybillModalOpen} onClose={() => setWaybillModalOpen(false)} title="Create J&T Waybill" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-300">Waybill Number</label>
            <input
              value={waybillForm.waybill_number}
              onChange={(event) => setWaybillForm((current) => ({ ...current, waybill_number: event.target.value }))}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="JT123456789"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-300">Tracking Number</label>
            <input
              value={waybillForm.tracking_number}
              onChange={(event) => setWaybillForm((current) => ({ ...current, tracking_number: event.target.value }))}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="JT123456789"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-300">Service Type</label>
            <input
              value={waybillForm.service_type}
              onChange={(event) => setWaybillForm((current) => ({ ...current, service_type: event.target.value.toLowerCase() }))}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
              maxLength={40}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-300">Notes</label>
            <textarea
              value={waybillForm.notes}
              onChange={(event) => setWaybillForm((current) => ({ ...current, notes: event.target.value }))}
              className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
              rows={3}
              maxLength={1000}
              placeholder="Booked manually through J&T"
            />
          </div>
          {statusError && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{statusError}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWaybillModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Cancel</button>
            <button
              type="button"
              onClick={handleCreateWaybill}
              disabled={waybillBusy || !waybillForm.waybill_number.trim() || !waybillForm.tracking_number.trim() || !waybillForm.service_type.trim()}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-500"
            >
              {waybillBusy ? 'Saving...' : 'Save Waybill'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Status Update Modal */}
      <Modal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} title="Update Order Status" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-gray-900 rounded-lg text-sm">
            <span className="text-gray-400">Order </span><span className="font-bold text-white">#{statusTarget?.id.toString().padStart(4, '0')}</span>
            <span className="text-gray-400"> - Current: </span><span className={`font-semibold ${statusTarget?.status === 'delivered' ? 'text-green-600' : 'text-white'}`}>{getOrderStatusLabel(statusTarget?.status)}</span>
          </div>
          {nextStatusOptions.length > 0 ? (
            <div className="space-y-1.5">
              {nextStatusOptions.map((s) => (
                <button key={s} onClick={() => setNewStatus(s)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all capitalize ${newStatus === s ? 'bg-red-500/10 border-red-200 text-orange-600' : 'bg-gray-800 border-gray-700 text-gray-600 hover:bg-gray-900'}`}>
                  {statusIcons[s]} {getOrderStatusLabel(s)}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-400">
              No direct staff status transition available for the current state.
            </div>
          )}

          {statusTarget?.status === 'shipped' && (
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <p className="text-xs font-medium text-indigo-700 mb-2">
                Rider action: confirm delivery before customer can complete the order.
              </p>
              <button
                onClick={handleRiderDeliveryConfirm}
                className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Confirm Delivery (Rider)
              </button>
            </div>
          )}

          {newStatus === 'shipped' && (
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-200">
              <label className="block text-xs font-medium text-orange-700 mb-1.5">Tracking Number</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number..."
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-gray-800"
              />
            </div>
          )}
          {newStatus === 'cancelled' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <label className="block text-xs font-medium text-red-700 mb-1.5">Cancellation Reason <span className="text-red-500">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 bg-gray-800 resize-none"
                rows={2}
              />
            </div>
          )}

          {statusError && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
              {statusError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setStatusModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleStatusUpdate}
              disabled={!newStatus || (newStatus === 'cancelled' && !cancelReason.trim())}
              className="px-4 py-2 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Update Status
            </button>
          </div>
        </div>
      </Modal>

      {/* Refund modal — owner only */}
      {!isStaff && showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Process Refund - Order #{refundOrder?.id}</h3>
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
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-red-500" />
                <p className="text-xs text-gray-400 mt-1">Order total: {'\u20B1'}{refundOrder?.total_amount?.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Reason</label>
                <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-red-500"
                  rows={3} placeholder="Reason for refund..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowRefundModal(false); setRefundOrder(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button onClick={handleRefund} disabled={refunding || !refundAmount}
                className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
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


