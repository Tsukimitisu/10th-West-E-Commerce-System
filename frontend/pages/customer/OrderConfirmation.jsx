import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, Package, Truck, Calendar, ArrowRight, Home, ShoppingBag, Printer } from 'lucide-react';
import { getOrderById } from '../../services/api';

const API = window.__API_URL__ || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const OrderConfirmation = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const resolveOrderItemProductId = (item) => {
    const candidate = Number(item?.productReferenceId ?? item?.productId ?? item?.product_id ?? item?.product?.id);
    return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
  };

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        const loadedOrder = await getOrderById(Number(id));
        setOrder(loadedOrder || null);
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-red-100 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      {/* Success icon */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={40} className="text-green-600" />
        </div>
        <h1 className="font-display font-bold text-2xl text-white mb-2">Order Confirmed!</h1>
        <p className="text-gray-400">Thank you for your purchase. We've sent a confirmation to your email.</p>
      </div>

      {order && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-6">
          {/* Order info */}
          <div className="p-6 border-b border-gray-700 text-center">
            <p className="text-sm text-gray-400">Order Number</p>
            <p className="font-display font-bold text-xl text-white mt-1">#{order.order_number || order.id}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
              <Calendar size={12} /> {new Date(order.created_at || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Estimated delivery */}
          <div className="p-4 bg-gray-900 flex items-center justify-center gap-3 text-sm">
            <Truck size={18} className="text-gray-600" />
            <span className="text-gray-600">Estimated delivery:</span>
            <span className="font-medium text-white">3-7 business days</span>
          </div>

          {/* Items */}
          <div className="p-6">
            <h3 className="font-semibold text-sm text-white mb-3">Order Summary</h3>
            <div className="space-y-3">
              {(order.items || []).map((item, i) => {
                const productId = resolveOrderItemProductId(item);
                const itemTitle = item.name || item.product_name;
                const itemImage = item.image_url || item.product?.image;
                const lineTotal = Number(item.price ?? item.product?.price ?? 0) * item.quantity;

                return (
                  <div key={`${productId || 'order-item'}-${i}`} className="flex items-center gap-3">
                    {productId ? (
                      <Link to={`/products/${productId}`} className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700 hover:ring-2 hover:ring-red-500/40 transition-all" title="View product">
                        {itemImage ? <img src={itemImage} alt={itemTitle} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-gray-400" /></div>}
                      </Link>
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700">
                        {itemImage ? <img src={itemImage} alt={itemTitle} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-gray-400" /></div>}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {productId ? (
                        <Link to={`/products/${productId}`} className="text-sm text-white truncate hover:text-red-500 transition-colors inline-block" title="View product">
                          {itemTitle}
                        </Link>
                      ) : (
                        <p className="text-sm text-white truncate">{itemTitle}</p>
                      )}
                      <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium text-white">₱{lineTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between font-semibold text-white">
              <span>Total</span>
              <span>₱{Number(order.total || order.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to={order ? `/orders/${order.id}` : '/orders'}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-500/100 hover:bg-red-600 text-white font-medium rounded-lg transition-colors">
          <Package size={16} /> Track Order
        </Link>
        {order && (
          <button onClick={() => window.open(`${API}/orders/${order.id}/invoice`, '_blank')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-700 text-gray-700 hover:bg-gray-900 font-medium rounded-lg transition-colors">
            <Printer size={16} /> View Invoice
          </button>
        )}
        <Link to="/shop"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-700 text-gray-700 hover:bg-gray-900 font-medium rounded-lg transition-colors">
          <ShoppingBag size={16} /> Continue Shopping
        </Link>
        <Link to="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-700 text-gray-700 hover:bg-gray-900 font-medium rounded-lg transition-colors">
          <Home size={16} /> Go Home
        </Link>
      </div>
    </div>
  );
};

export default OrderConfirmation;


