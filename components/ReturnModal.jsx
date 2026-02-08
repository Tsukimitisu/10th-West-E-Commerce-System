import React, { useState } from 'react';
import { X, RotateCcw, AlertTriangle, Package, CreditCard, Wallet } from 'lucide-react';
import { createReturn } from '../services/api';

const RETURN_REASONS = [
  { value: 'wrong_size', label: 'Wrong Size / Fitment' },
  { value: 'damaged', label: 'Item Damaged / Defective' },
  { value: 'wrong_item', label: 'Wrong Item Received' },
  { value: 'not_as_described', label: 'Not as Described' },
  { value: 'changed_mind', label: 'Changed My Mind' },
  { value: 'quality', label: 'Quality Not Satisfactory' },
  { value: 'other', label: 'Other' },
];

const ReturnModal = ({ isOpen, onClose, order, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [selectedItems, setSelectedItems] = useState({});
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('refund');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const user = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');

  const toggleItem = (productId, maxQty) => {
    setSelectedItems(prev => {
      const copy = { ...prev };
      if (copy[productId]) {
        delete copy[productId];
      } else {
        copy[productId] = maxQty;
      }
      return copy;
    });
  };

  const updateQty = (productId, qty, maxQty) => {
    if (qty < 1) qty = 1;
    if (qty > maxQty) qty = maxQty;
    setSelectedItems(prev => ({ ...prev, [productId]: qty }));
  };

  const selectedCount = Object.keys(selectedItems).length;
  const refundTotal = Object.entries(selectedItems).reduce((sum, [pid, qty]) => {
    const item = order.items.find(i => i.productId === Number(pid));
    return sum + (item ? item.product.price * qty : 0);
  }, 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const itemsToReturn = Object.entries(selectedItems).map(([pid, qty]) => {
        const item = order.items.find(i => i.productId === Number(pid));
        return {
          productId: Number(pid),
          productName: item?.product.name || 'Unknown',
          quantity: qty,
          price: item?.product.price || 0
        };
      });

      await createReturn({
        order_id: order.id,
        user_id: user.id,
        items: itemsToReturn,
        reason: `${RETURN_REASONS.find(r => r.value === reason)?.label || reason}${notes ? ' - ' + notes : ''}`,
        refund_amount: refundTotal,
        type: 'online'
      });

      onSuccess();
      handleReset();
    } catch (e) {
      alert('Failed to submit return request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedItems({});
    setReason('');
    setResolution('refund');
    setNotes('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-red-50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-gray-900">Return Items</h2>
            <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">Order #{order.id}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/80 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100">
          {['Select Items', 'Reason', 'Resolution'].map((label, idx) => (
            <React.Fragment key={idx}>
              <div className={`flex items-center gap-1.5 ${idx + 1 <= step ? 'text-orange-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx + 1 < step ? 'bg-orange-600 text-white' : idx + 1 === step ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {idx + 1}
                </div>
                <span className="text-xs font-medium hidden sm:inline">{label}</span>
              </div>
              {idx < 2 && <div className={`flex-1 h-0.5 mx-1 rounded ${idx + 1 < step ? 'bg-orange-500' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Select Items */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Select the items you want to return:</p>
              {order.items.map((item) => {
                const isSelected = !!selectedItems[item.productId];
                return (
                  <div
                    key={item.productId}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleItem(item.productId, item.quantity)}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-orange-600 border-orange-600' : 'border-gray-300'
                    }`}>
                      {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <img src={item.product.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500">₱{item.product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })} x {item.quantity}</p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <label className="text-xs text-gray-500 mr-1">Qty:</label>
                        <select
                          value={selectedItems[item.productId]}
                          onChange={(e) => updateQty(item.productId, Number(e.target.value), item.quantity)}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                        >
                          {Array.from({ length: item.quantity }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 2: Select Reason */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Why are you returning these items?</p>
              <div className="space-y-2">
                {RETURN_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      reason === r.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Additional notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 3: Choose Resolution */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">How would you like to be compensated?</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setResolution('refund')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    resolution === 'refund' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard className={`w-8 h-8 mx-auto mb-2 ${resolution === 'refund' ? 'text-orange-600' : 'text-gray-400'}`} />
                  <p className={`text-sm font-bold ${resolution === 'refund' ? 'text-orange-700' : 'text-gray-700'}`}>Refund</p>
                  <p className="text-xs text-gray-500 mt-1">Back to original payment</p>
                </button>
                <button
                  onClick={() => setResolution('store_credit')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    resolution === 'store_credit' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Wallet className={`w-8 h-8 mx-auto mb-2 ${resolution === 'store_credit' ? 'text-orange-600' : 'text-gray-400'}`} />
                  <p className={`text-sm font-bold ${resolution === 'store_credit' ? 'text-orange-700' : 'text-gray-700'}`}>Store Credit</p>
                  <p className="text-xs text-gray-500 mt-1">Instant credit to wallet</p>
                </button>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 mt-4">
                <h4 className="text-sm font-bold text-gray-900 mb-3">Return Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Items to return</span>
                    <span className="font-medium">{selectedCount} item(s)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reason</span>
                    <span className="font-medium">{RETURN_REASONS.find(r => r.value === reason)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Resolution</span>
                    <span className="font-medium">{resolution === 'refund' ? 'Refund to payment' : 'Store Credit'}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="text-gray-700 font-bold">Total Refund</span>
                    <span className="text-orange-600 font-bold text-base">
                      ₱{refundTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 p-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Return requests are reviewed within 1-2 business days. You'll receive an email with shipping instructions once approved.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? selectedCount === 0 : !reason}
                className="px-6 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:bg-gray-400"
              >
                {submitting ? 'Submitting...' : 'Submit Return'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnModal;
