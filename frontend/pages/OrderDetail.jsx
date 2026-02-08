import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, ArrowLeft, Truck, MapPin, CreditCard, Clock, CheckCircle2, XCircle, Download, RotateCcw, Calendar, Mail } from 'lucide-react';
import { getOrderById } from '../services/api';

const stepLabels = ['Order Placed', 'Processing', 'Shipped', 'Delivered'];
const stepForStatus = { pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: -1 };

const OrderDetail = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const data = await getOrderById(Number(id)); setOrder(data); } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="animate-pulse space-y-6">
        <div className="h-6 bg-gray-200 rounded w-48" />
        <div className="h-24 bg-gray-200 rounded-xl" />
        <div className="h-48 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );

  if (!order) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <Package size={48} className="mx-auto text-gray-300 mb-3" />
      <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Order not found</h2>
      <Link to="/orders" className="text-red-600 hover:text-red-700 text-sm font-medium">Back to orders</Link>
    </div>
  );

  const step = stepForStatus[order.status] ?? 0;
  const date = new Date(order.created_at || order.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const items = order.items || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Orders
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Order #{order.order_number || order.id}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><Calendar size={14} /> Placed on {date}</p>
        </div>
        <div className="flex gap-2">
          {order.status === 'delivered' && (
            <Link to={`/orders/${order.id}/return`} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors">
              <RotateCcw size={14} /> Request Return
            </Link>
          )}
        </div>
      </div>

      {/* Progress tracker */}
      {order.status !== 'cancelled' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200 z-0" />
            <div className="absolute left-0 top-4 h-0.5 bg-red-600 z-0 transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }} />
            {stepLabels.map((label, i) => (
              <div key={label} className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${i <= step ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {i < step ? <CheckCircle2 size={16} /> : i + 1}
                </div>
                <span className={`text-xs mt-2 ${i <= step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {order.status === 'cancelled' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <XCircle size={20} className="text-red-500" />
          <p className="text-sm text-red-700 font-medium">This order has been cancelled.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Items ({items.length})</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="w-16 h-16 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden flex-shrink-0">
                  {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center"><Package size={20} className="text-gray-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.product_name}</p>
                  {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">â‚±{(Number(item.price) * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          {/* Order Summary */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>â‚±{Number(order.subtotal || order.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              {Number(order.discount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-â‚±{Number(order.discount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Shipping</span><span>{Number(order.shipping || 0) === 0 ? 'Free' : `â‚±${Number(order.shipping).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</span></div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900">
                <span>Total</span><span>â‚±{Number(order.total || order.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><MapPin size={14} /> Shipping Address</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {order.shipping_name || order.address?.name || 'â€”'}<br />
              {order.shipping_address || order.address?.street || ''}<br />
              {order.shipping_city || order.address?.city || ''}{order.shipping_state ? `, ${order.shipping_state}` : ''} {order.shipping_zip || order.address?.zip || ''}<br />
              {order.shipping_phone || order.address?.phone || ''}
            </p>
          </div>

          {/* Payment */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><CreditCard size={14} /> Payment</h3>
            <p className="text-sm text-gray-600 capitalize">{order.payment_method || 'Card'}</p>
            {order.payment_status && <p className="text-xs text-gray-400 capitalize mt-0.5">Status: {order.payment_status}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
