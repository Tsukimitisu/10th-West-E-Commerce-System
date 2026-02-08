import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Package, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { getOrderById } from '../../services/api';

const API = window.__API_URL__ || 'http://localhost:5000/api';

const reasons = [
  'Defective / Damaged item',
  'Wrong item received',
  'Item not as described',
  'Changed my mind',
  'Better price found elsewhere',
  'Item arrived late',
  'Other',
];

const RequestReturn = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try { const data = await getOrderById(Number(id)); setOrder(data); } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  const toggleItem = (idx) => {
    const next = new Set(selectedItems);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedItems(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.size === 0) { setError('Please select at least one item to return'); return; }
    if (!reason) { setError('Please select a reason'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('shopCoreToken');
      const items = order.items.filter((_, i) => selectedItems.has(i)).map((item) => ({
        product_id: item.product_id || item.id,
        quantity: item.quantity,
        name: item.name || item.product_name,
      }));
      const res = await fetch(`${API}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, reason, notes, items }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit return');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-48" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );

  if (success) return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-green-600" />
      </div>
      <h2 className="font-display font-bold text-xl text-gray-900 mb-2">Return Request Submitted</h2>
      <p className="text-gray-500 text-sm mb-6">We'll review your request and get back to you within 1–2 business days.</p>
      <div className="flex gap-3 justify-center">
        <Link to="/my-returns" className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">View My Returns</Link>
        <Link to="/orders" className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Back to Orders</Link>
      </div>
    </div>
  );

  if (!order) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <Package size={48} className="mx-auto text-gray-300 mb-3" />
      <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Order not found</h2>
      <Link to="/orders" className="text-red-600 hover:text-red-700 text-sm font-medium">Back to orders</Link>
    </div>
  );

  const items = order.items || [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Order
      </Link>

      <h1 className="font-display font-bold text-xl text-gray-900 mb-1 flex items-center gap-2"><RotateCcw size={22} /> Request Return</h1>
      <p className="text-sm text-gray-500 mb-6">Order #{order.order_number || order.id}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Select items */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Select items to return</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item, i) => (
              <label key={i} className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selectedItems.has(i) ? 'bg-red-50/50' : ''}`}>
                <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleItem(i)}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500" />
                <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
                  {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-gray-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.product_name}</p>
                  <p className="text-xs text-gray-500">Qty: {item.quantity} · ₱{Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Reason for return</h3>
          <div className="space-y-2">
            {reasons.map(r => (
              <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500" />
                <span className="text-gray-700">{r}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Additional notes <span className="text-gray-400 font-normal">(optional)</span></h3>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Provide any additional details about your return..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
          {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RotateCcw size={16} />}
          Submit Return Request
        </button>
      </form>
    </div>
  );
};

export default RequestReturn;
