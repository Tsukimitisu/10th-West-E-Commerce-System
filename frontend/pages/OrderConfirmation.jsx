import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, Package, Truck, Calendar, ArrowRight, Home, ShoppingBag } from 'lucide-react';

const API = window.__API_URL__ || 'http://localhost:5000/api';

const OrderConfirmation = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('shopCoreToken');
        const res = await fetch(`${API}/orders/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setOrder(await res.json());
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-red-100 border-t-red-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      {/* Success icon */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={40} className="text-green-600" />
        </div>
        <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">Order Confirmed!</h1>
        <p className="text-gray-500">Thank you for your purchase. We've sent a confirmation to your email.</p>
      </div>

      {order && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
          {/* Order info */}
          <div className="p-6 border-b border-gray-100 text-center">
            <p className="text-sm text-gray-500">Order Number</p>
            <p className="font-display font-bold text-xl text-gray-900 mt-1">#{order.order_number || order.id}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
              <Calendar size={12} /> {new Date(order.created_at || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Estimated delivery */}
          <div className="p-4 bg-gray-50 flex items-center justify-center gap-3 text-sm">
            <Truck size={18} className="text-gray-600" />
            <span className="text-gray-600">Estimated delivery:</span>
            <span className="font-medium text-gray-900">3â€“7 business days</span>
          </div>

          {/* Items */}
          <div className="p-6">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Order Summary</h3>
            <div className="space-y-3">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                    {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-gray-400" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.name || item.product_name}</p>
                    <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">₱{(Number(item.price) * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between font-semibold text-gray-900">
              <span>Total</span>
              <span>₱{Number(order.total || order.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to={order ? `/orders/${order.id}` : '/orders'}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
          <Package size={16} /> Track Order
        </Link>
        <Link to="/shop"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium rounded-lg transition-colors">
          <ShoppingBag size={16} /> Continue Shopping
        </Link>
        <Link to="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium rounded-lg transition-colors">
          <Home size={16} /> Go Home
        </Link>
      </div>
    </div>
  );
};

export default OrderConfirmation;
