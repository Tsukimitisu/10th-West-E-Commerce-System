import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Package, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { createReturn, getOrderById } from '../../services/api';

const RequestReturn = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getOrderById(Number(id));
        setOrder(data);
      } catch {
        setOrder(null);
      }
      setLoading(false);
    };

    load();
  }, [id]);

  const items = order?.items || [];
  const selectedCount = selectedItems.size;
  const returnDeadline = order?.return_deadline_at
    ? new Date(order.return_deadline_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const existingReturnStatus = order?.return_request?.status || '';

  const selectedPreview = useMemo(
    () => items.filter((_, index) => selectedItems.has(index)),
    [items, selectedItems]
  );

  const toggleItem = (index) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (selectedItems.size === 0) {
      setError('Select at least one item to return.');
      return;
    }

    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError('Please explain why you want to return the selected item(s).');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createReturn({
        order_id: order.id,
        reason: normalizedReason,
        items: selectedPreview.map((item) => ({
          product_id: item.product_id || item.productId || item.id,
          quantity: item.quantity,
        })),
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to submit return request.');
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="font-display font-bold text-xl text-white mb-2">Return Request Submitted</h2>
        <p className="text-gray-400 text-sm mb-6">Your request is now pending review.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/my-returns" className="px-5 py-2.5 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">View My Returns</Link>
          <Link to={`/orders/${id}`} className="px-5 py-2.5 border border-gray-700 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors">Back to Order</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Package size={48} className="mx-auto text-gray-300 mb-3" />
        <h2 className="font-display font-semibold text-xl text-white mb-2">Order not found</h2>
        <Link to="/orders" className="text-red-500 hover:text-orange-600 text-sm font-medium">Back to orders</Link>
      </div>
    );
  }

  const blocked = !order.return_eligible;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Order
      </Link>

      <h1 className="font-display font-bold text-xl text-white mb-1 flex items-center gap-2"><RotateCcw size={22} /> Request Return</h1>
      <p className="text-sm text-gray-400 mb-6">Order #{order.order_number || order.id}</p>

      {order.return_window_days && (
        <div className="mb-4 p-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 flex items-start gap-2">
          <Clock size={16} className="mt-0.5 text-white" />
          <div>
            <p>Return window: {order.return_window_days} day(s) from delivery.</p>
            {returnDeadline && <p className="mt-1">Deadline: {returnDeadline}</p>}
          </div>
        </div>
      )}

      {(error || blocked) && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p>{error || order.return_eligibility_message || 'This order is not eligible for return.'}</p>
            {existingReturnStatus && (
              <p className="mt-1 capitalize">Current return status: {existingReturnStatus}</p>
            )}
          </div>
        </div>
      )}

      {blocked ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
          <p className="text-sm text-gray-400">You can review any submitted return request from your returns page.</p>
          <div className="flex gap-3">
            <Link to="/my-returns" className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">Go to My Returns</Link>
            <Link to={`/orders/${order.id}`} className="px-4 py-2 border border-gray-700 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors">Back to Order</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="font-semibold text-white text-sm">Select items to return</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item, index) => (
                <label
                  key={`${item.product_id || item.id || index}-${index}`}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-900 transition-colors ${selectedItems.has(index) ? 'bg-red-500/10' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(index)}
                    onChange={() => toggleItem(index)}
                    className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <div className="w-12 h-12 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0">
                    {(item.image_url || item.product?.image) ? (
                      <img src={item.image_url || item.product?.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={16} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name || item.product_name || item.product?.name}</p>
                    <p className="text-xs text-gray-400">
                      Qty: {item.quantity} · ₱{Number(item.price ?? item.product_price ?? item.product?.price ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-white text-sm">Reason for return</h3>
              <span className="text-xs text-gray-400">{selectedCount} item(s) selected</span>
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Describe the issue with the selected item(s)."
              className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-2">{reason.trim().length}/1000</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RotateCcw size={16} />}
            Submit Return Request
          </button>
        </form>
      )}
    </div>
  );
};

export default RequestReturn;
