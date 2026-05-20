import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { getPaymentOrderStatus } from '../../services/api';

const getCopy = (paymentStatus, queryStatus) => {
  if (paymentStatus === 'paid') {
    return {
      icon: <CheckCircle2 size={42} className="text-green-600" />,
      title: 'Payment received',
      body: 'Your order is now paid. J&T waybill generation will start automatically.',
    };
  }

  if (paymentStatus === 'failed' || paymentStatus === 'expired' || queryStatus === 'cancelled') {
    return {
      icon: <XCircle size={42} className="text-red-600" />,
      title: 'Payment was not completed',
      body: 'Your reserved items were released. You can return to your cart and try again.',
    };
  }

  return {
    icon: <Clock size={42} className="text-blue-600" />,
    title: 'Waiting for GCash confirmation',
    body: 'PayMongo is still confirming your payment. This page will refresh automatically.',
  };
};

const PaymentResult = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const orderId = params.get('order');
  const queryStatus = params.get('status');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState('');

  const loadStatus = async () => {
    if (!orderId) {
      setLoading(false);
      setError('Missing order reference.');
      return;
    }

    try {
      const data = await getPaymentOrderStatus(orderId);
      setOrder(data);
      setError('');
      if (data?.payment_status === 'paid') {
        window.setTimeout(() => navigate(`/order-confirmation/${orderId}`), 1200);
      }
    } catch (statusError) {
      setError(statusError?.message || 'Unable to load payment status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const timer = window.setInterval(() => {
      if (!orderId || order?.payment_status === 'paid') return;
      loadStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [orderId, order?.payment_status]);

  const copy = getCopy(order?.payment_status, queryStatus);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 text-gray-900">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">{copy.icon}</div>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{copy.body}</p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Order</span>
            <span className="font-semibold">#{orderId || '-'}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="text-gray-500">Payment</span>
            <span className="font-semibold capitalize">{loading ? 'checking' : (order?.payment_status || queryStatus || 'pending')}</span>
          </div>
          {order?.waybill_status && (
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-gray-500">J&T Waybill</span>
              <span className="font-semibold capitalize">{order.waybill_status}</span>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={loadStatus}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Check Status
          </button>
          <Link
            to={order?.payment_status === 'paid' ? `/orders/${orderId}` : '/shop'}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            {order?.payment_status === 'paid' ? 'View Order' : 'Continue Shopping'}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentResult;

