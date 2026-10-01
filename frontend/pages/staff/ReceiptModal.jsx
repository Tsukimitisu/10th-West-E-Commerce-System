import React from 'react';
import { CheckCircle2, Printer, X } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';

const formatCurrency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value || 0));

const ReceiptModal = ({ order, onClose, onNewSale }) => {
  const handlePrint = () => window.print();
  const createdAt = order?.created_at ? new Date(order.created_at) : new Date();

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={18} /> Sale completed
          </div>
          <div className="flex gap-1">
            <button onClick={handlePrint} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-200" aria-label="Print receipt"><Printer size={18} /></button>
            <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-200" aria-label="Close receipt"><X size={18} /></button>
          </div>
        </div>

        <div className="bg-white p-7 text-slate-950" id="receipt-content">
          <div className="text-center">
            <BrandMark link={false} className="justify-center" />
            <h1 id="receipt-title" className="sr-only">POS receipt</h1>
            <p className="mt-4 font-mono text-xs font-bold">{order.receipt_number}</p>
            <p className="mt-1 text-xs text-slate-500">{createdAt.toLocaleString('en-PH')}</p>
          </div>

          <dl className="mt-5 space-y-1 border-y border-dashed border-slate-300 py-4 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Order</dt><dd className="font-semibold">#{order.order_id || order.id}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Cashier</dt><dd className="font-semibold">{order.cashier_name || 'Staff'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Payment</dt><dd className="font-semibold uppercase">{order.payment_method}</dd></div>
            {order.payment_reference && <div className="flex justify-between gap-4"><dt className="text-slate-500">Reference</dt><dd className="font-mono font-semibold">{order.payment_reference}</dd></div>}
          </dl>

          <div className="my-5 space-y-3">
            {(order.items || []).map((item) => (
              <div key={item.id || `${item.product_id}:${item.variant_id || 0}`} className="flex justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{item.product_name}</p>
                  {item.variant_name_snapshot && <p className="text-xs text-slate-500">{item.variant_name_snapshot}</p>}
                  <p className="font-mono text-xs text-slate-500">{item.quantity} × {formatCurrency(item.product_price)}</p>
                </div>
                <span className="shrink-0 font-mono font-semibold">{formatCurrency(item.line_total ?? Number(item.product_price) * item.quantity)}</span>
              </div>
            ))}
          </div>

          <dl className="space-y-2 border-t border-dashed border-slate-300 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{formatCurrency(order.subtotal_amount)}</dd></div>
            {Number(order.discount_amount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>-{formatCurrency(order.discount_amount)}</dd></div>}
            <div className="flex justify-between font-display text-lg font-black"><dt>Total</dt><dd>{formatCurrency(order.total_amount)}</dd></div>
            {order.payment_method === 'cash' && (
              <>
                <div className="flex justify-between"><dt className="text-slate-600">Amount received</dt><dd>{formatCurrency(order.amount_tendered)}</dd></div>
                <div className="flex justify-between font-bold"><dt>Change</dt><dd>{formatCurrency(order.change_due)}</dd></div>
              </>
            )}
          </dl>

          <p className="mt-7 text-center text-xs leading-5 text-slate-500">Thank you for shopping with 10th West Moto. Keep this receipt for your records.</p>
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 print:hidden">
          <button onClick={handlePrint} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"><Printer size={16} /> Print</button>
          <button onClick={onNewSale} className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">New sale</button>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-content, #receipt-content * { visibility: visible !important; }
          #receipt-content { position: absolute; inset: 0 auto auto 0; width: 80mm; padding: 8mm; }
        }
      `}</style>
    </div>
  );
};

export default ReceiptModal;
