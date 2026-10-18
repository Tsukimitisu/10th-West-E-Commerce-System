import { useCart } from '../../context/CartContext.jsx';
﻿import React, { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { CheckCircle2, Package, Truck, Calendar, Home, ShoppingBag, Printer } from 'lucide-react';
import { getOrderById, getPaymentOrderStatus } from '../../services/api';
import { API_URL } from '../../services/apiConfig.js';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => {
  const parsed = toFiniteNumber(value, 0);
  return Math.round(parsed * 100) / 100;
};

const formatCurrency = (value) => `₱${roundCurrency(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const OrderConfirmation = () => {
  const { syncCart } = useCart();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const resolveOrderItemProductId = (item) => {
    const candidate = Number(item?.productReferenceId ?? item?.productId ?? item?.product_id ?? item?.product?.id);
    return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
  };

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        const loadedOrder = await getOrderById(Number(id));
        if (loadedOrder?.payment_method === 'gcash' && loadedOrder.payment_status === 'paid') {
          await getPaymentOrderStatus(Number(id));
          await syncCart();
        }
        setOrder(loadedOrder || null);
      } catch { setError('Unable to load your order. Please try again from My Orders.'); }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-red-100 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );

  const vatAmount = roundCurrency(order?.confirmed_totals?.tax ?? 0);
  const totalAmount = roundCurrency(order?.confirmed_totals?.total ?? order?.total_amount ?? 0);
  if (!order) return <div className="mx-auto max-w-xl px-4 py-16 text-center" role="alert"><h1 className="font-display text-3xl">Order unavailable</h1><p className="my-4">{error || 'This order could not be found.'}</p><Link to="/orders" className="brand-button brand-button-primary">My Orders</Link></div>;
  if (order.payment_method === 'gcash' && order.payment_status !== 'paid') return <Navigate to={`/payment-result?order=${order.id}`} replace />;
  const subtotal = order.confirmed_totals?.subtotal;
  const shipping = order.confirmed_totals?.shipping;
  const discount = order.confirmed_totals?.discount;
  const secondaryActionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50';

  return <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
    <header className="mb-8 text-center">
      <CheckCircle2 size={52} className="mx-auto mb-4 text-green-700" aria-hidden="true" />
      <h1 className="font-display text-4xl font-bold text-slate-950 sm:text-5xl">Order Confirmed!</h1>
      <p className="mt-3 text-slate-700">Thank you for your purchase.</p>
      <p className="mt-1 text-sm text-slate-600">You can follow your order's progress from My Orders.</p>
    </header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Order confirmation">
      <dl className="grid gap-5 bg-[#111C3D] p-5 text-white sm:grid-cols-3 sm:p-6">
        <div><dt className="text-sm text-slate-300">Order Number</dt><dd className="mt-1 break-words text-lg font-semibold">#{order.order_number || order.id}</dd></div>
        <div><dt className="flex items-center gap-2 text-sm text-slate-300"><Calendar size={16} aria-hidden="true" />Order Date</dt><dd className="mt-1 font-medium">{order.created_at ? new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not available'}</dd></div>
        <div><dt className="flex items-center gap-2 text-sm text-slate-300"><Truck size={16} aria-hidden="true" />Estimated Delivery</dt><dd className="mt-1 font-medium">{order.estimated_delivery || '3-7 business days'}</dd></div>
      </dl>
      <div className="p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Order Summary</h2>
        <ul className="divide-y divide-slate-200">
          {(order.items || []).map((item, i) => {
            const productId = resolveOrderItemProductId(item);
            const itemTitle = item.name || item.product_name;
            const itemImage = item.image_url || item.image_snapshot || item.product?.image;
            const lineTotal = roundCurrency(roundCurrency(item.price ?? item.product_price ?? item.product?.price ?? 0) * Math.max(0, toFiniteNumber(item.quantity, 0)));
            return <li key={`${productId || 'item'}-${i}`} className="flex items-start gap-3 py-4 first:pt-0">
              <img src={resolveProductImageUrl(itemImage)} alt={itemTitle} onError={handleProductImageError} width="64" height="64" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-contain" />
              <div className="min-w-0 flex-1 text-sm">
                {productId ? <Link to={`/products/${productId}`} className="break-words font-semibold text-slate-900 hover:underline">{itemTitle}</Link> : <p className="break-words font-semibold text-slate-900">{itemTitle}</p>}
                {(item.variant_name_snapshot || item.variant_label) && <p className="mt-1 text-slate-600">{item.variant_name_snapshot || item.variant_label}</p>}
                <p className="mt-1 text-slate-600">Qty: {item.quantity}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(lineTotal)}</span>
            </li>;
          })}
        </ul>
        <dl className="mt-4 space-y-3 border-t border-slate-200 pt-5 text-sm text-slate-700">
          {subtotal != null && <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{formatCurrency(subtotal)}</dd></div>}
          {shipping != null && <div className="flex justify-between gap-4"><dt>Shipping</dt><dd>{formatCurrency(shipping)}</dd></div>}
          {Number(discount) > 0 && <div className="flex justify-between gap-4"><dt>Discount</dt><dd>-{formatCurrency(discount)}</dd></div>}
          {vatAmount > 0 && <div className="flex justify-between gap-4"><dt>VAT</dt><dd>{formatCurrency(vatAmount)}</dd></div>}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-4 text-lg font-bold text-slate-950"><dt>Total</dt><dd>{formatCurrency(totalAmount)}</dd></div>
        </dl>
      </div>
    </section>
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Link to={`/orders/${order.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-slate-950 hover:bg-orange-500"><Package size={18} aria-hidden="true" />Track Order</Link>
      <Link to="/shop" className={secondaryActionClass}><ShoppingBag size={18} aria-hidden="true" />Continue Shopping</Link>
      <button type="button" onClick={() => window.open(`${API_URL}/orders/${order.id}/invoice`, '_blank', 'noopener,noreferrer')} className={secondaryActionClass}><Printer size={16} aria-hidden="true" />View Invoice</button>
      <Link to="/" className={secondaryActionClass}><Home size={16} aria-hidden="true" />Go Home</Link>
    </div>
  </div>;
};

export default OrderConfirmation;
