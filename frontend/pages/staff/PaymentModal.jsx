import React, { useMemo, useState } from 'react';
import { Banknote, Loader2, Smartphone, X } from 'lucide-react';

const formatCurrency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value || 0));

const PaymentModal = ({ total, processing = false, error = '', onComplete, onCancel }) => {
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const numericTendered = Number(tendered);
  const changeDue = useMemo(
    () => method === 'cash' && Number.isFinite(numericTendered) ? Math.max(0, numericTendered - total) : 0,
    [method, numericTendered, total],
  );
  const canSubmit = method === 'cash'
    ? Number.isFinite(numericTendered) && numericTendered >= total
    : reference.trim().length >= 4;

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit || processing) return;
    onComplete({
      paymentMethod: method,
      amountTendered: method === 'cash' ? numericTendered : total,
      paymentReference: method === 'gcash' ? reference.trim() : '',
    });
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Complete sale</p>
            <h2 id="payment-title" className="mt-1 font-display text-xl font-bold text-slate-950">Payment due: {formatCurrency(total)}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={processing} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Close payment">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Payment method</legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                aria-pressed={method === 'cash'}
                className={`flex min-h-20 items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${method === 'cash' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <Banknote className="text-emerald-600" size={26} />
                <span><strong className="block text-sm text-slate-950">Cash</strong><span className="text-xs text-slate-600">Calculate change</span></span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('gcash')}
                aria-pressed={method === 'gcash'}
                className={`flex min-h-20 items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${method === 'gcash' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <Smartphone className="text-blue-600" size={26} />
                <span><strong className="block text-sm text-slate-950">GCash</strong><span className="text-xs text-slate-600">Manual reference</span></span>
              </button>
            </div>
          </fieldset>

          {method === 'cash' ? (
            <div>
              <label htmlFor="amount-received" className="text-sm font-semibold text-slate-800">Amount received</label>
              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-500">₱</span>
                <input
                  id="amount-received"
                  type="number"
                  min={total}
                  step="0.01"
                  autoFocus
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  className="h-14 w-full rounded-xl border border-slate-300 pl-9 pr-4 text-2xl font-bold text-slate-950 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                  placeholder="0.00"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000]
                  .filter((value, index, all) => all.indexOf(value) === index)
                  .map((value) => (
                    <button key={value} type="button" onClick={() => setTendered(String(value))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {formatCurrency(value)}
                    </button>
                  ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-white">
                <span className="text-sm text-slate-300">Change due</span>
                <strong className="font-display text-xl">{formatCurrency(changeDue)}</strong>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="gcash-reference" className="text-sm font-semibold text-slate-800">GCash reference number</label>
              <input
                id="gcash-reference"
                type="text"
                autoFocus
                value={reference}
                onChange={(event) => setReference(event.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64))}
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                placeholder="Enter confirmed payment reference"
              />
              <p className="mt-2 text-xs leading-5 text-slate-600">Confirm payment in the merchant account before recording the reference. This screen does not simulate or authorize a GCash payment.</p>
            </div>
          )}

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <button type="button" onClick={onCancel} disabled={processing} className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!canSubmit || processing} className="inline-flex min-h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-5 text-sm font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45">
            {processing && <Loader2 size={17} className="animate-spin" />}
            {processing ? 'Completing sale…' : `Charge ${formatCurrency(total)}`}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PaymentModal;
