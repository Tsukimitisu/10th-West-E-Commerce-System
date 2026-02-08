import React from 'react';
import { Printer, X, Bike } from 'lucide-react';

const ReceiptModal = ({ order, onClose, onNewSale }) => {
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle w-full max-w-sm">
          {/* No-print control bar */}
          <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-b print:hidden">
            <h3 className="text-sm font-bold text-slate-700">Receipt Preview</h3>
            <div className="flex space-x-2">
              <button onClick={handlePrint} className="p-2 text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <Printer className="w-5 h-5" />
              </button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-8 bg-white" id="receipt-content">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-2">
                  <Bike className="w-8 h-8 text-black" />
              </div>
              <h1 className="text-xl font-black uppercase tracking-widest text-black leading-none">10TH WEST</h1>
              <h2 className="text-xs font-bold uppercase tracking-widest text-black mb-2">Motorcycle Parts & Accessories</h2>
              <p className="text-xs text-gray-500 mt-1">123 Moto Avenue, West District</p>
              <p className="text-xs text-gray-500">Tel: (555) 999-MOTO</p>
            </div>

            <div className="border-b border-dashed border-gray-300 pb-4 mb-4 text-xs text-gray-500 font-mono">
              <div className="flex justify-between">
                <span>Order #: {order.id}</span>
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Cashier: {order.cashier_id || 'Staff'}</span>
                <span>{new Date(order.created_at).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6 font-mono">
              {order.items.map((item, idx) => {
                  const price = (item.product.is_on_sale && item.product.sale_price) ? item.product.sale_price : item.product.price;
                  return (
                    <div key={idx} className="flex justify-between text-sm">
                      <div className="flex-1 pr-4">
                        <span className="text-black block font-bold">{item.product.name}</span>
                        <span className="text-gray-500 text-xs">{item.quantity} x ${price.toFixed(2)}</span>
                      </div>
                      <span className="text-black font-bold">${(item.quantity * price).toFixed(2)}</span>
                    </div>
                  );
              })}
            </div>

            <div className="border-t border-dashed border-gray-300 pt-4 space-y-1 text-sm font-mono">
              {order.discount_amount && order.discount_amount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>-${order.discount_amount.toFixed(2)}</span>
                  </div>
              )}
              <div className="flex justify-between font-black text-black text-lg">
                <span>TOTAL</span>
                <span>${order.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600 text-xs mt-2 uppercase">
                <span>Method</span>
                <span>{order.payment_method}</span>
              </div>
              {order.payment_method === 'cash' && (
                <>
                  <div className="flex justify-between text-gray-600 text-xs">
                    <span>Tendered</span>
                    <span>${order.amount_tendered?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 text-xs">
                    <span>Change</span>
                    <span>${order.change_due?.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-8 text-center">
              <div className="inline-block bg-black h-8 w-full opacity-10 mb-2"></div>
              <p className="text-xs text-gray-500 font-bold uppercase">Ride Safe!</p>
              <p className="text-[10px] text-gray-400 mt-1">No returns on electrical parts.</p>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-4 sm:flex sm:flex-row-reverse print:hidden gap-2">
            <button
              onClick={onNewSale}
              className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-slate-900 text-base font-bold text-white hover:bg-slate-800 sm:ml-3 sm:w-auto sm:text-sm"
            >
              New Sale
            </button>
            <button
              onClick={handlePrint}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-bold text-slate-700 hover:bg-slate-50 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Print
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default ReceiptModal;