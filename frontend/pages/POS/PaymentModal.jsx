import React, { useState } from 'react';
import { Loader2, CreditCard, Banknote, X, CheckCircle } from 'lucide-react';

const PaymentModal = ({ total, onComplete, onCancel }) => {
  const [method, setMethod] = useState(null);
  const [tendered, setTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardSuccess, setCardSuccess] = useState(false);

  const handleCashSubmit = (e) => {
    e.preventDefault();
    const tenderedFloat = parseFloat(tendered);
    if (tenderedFloat >= total) {
      onComplete('cash', tenderedFloat, tenderedFloat - total);
    }
  };

  const handleCardProcess = () => {
    setIsProcessing(true);
    // Simulate terminal interaction
    setTimeout(() => {
      setIsProcessing(false);
      setCardSuccess(true);
      setTimeout(() => {
        onComplete('card', total, 0);
      }, 1000);
    }, 2000);
  };

  const changeDue = tendered ? parseFloat(tendered) - total : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Payment Due: ₱{total.toFixed(2)}
              </h3>
              <button onClick={onCancel} className="text-gray-400 hover:text-gray-500">
                <X className="h-6 w-6" />
              </button>
            </div>

            {!method ? (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMethod('cash')}
                  className="flex flex-col items-center justify-center p-8 border-2 border-gray-100 rounded-2xl hover:border-red-500 hover:bg-red-50 transition-all group"
                >
                  <Banknote className="h-12 w-12 text-green-600 mb-4 group-hover:scale-110 transition-transform" />
                  <span className="text-lg font-bold text-gray-900">Cash</span>
                </button>
                <button
                  onClick={() => setMethod('card')}
                  className="flex flex-col items-center justify-center p-8 border-2 border-gray-100 rounded-2xl hover:border-red-500 hover:bg-red-50 transition-all group"
                >
                  <CreditCard className="h-12 w-12 text-red-600 mb-4 group-hover:scale-110 transition-transform" />
                  <span className="text-lg font-bold text-gray-900">Card</span>
                </button>
              </div>
            ) : method === 'cash' ? (
              <form onSubmit={handleCashSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount Tendered</label>
                  <div className="relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-lg">₱</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      required
                      className="focus:ring-red-500 focus:border-red-500 block w-full pl-8 pr-12 sm:text-2xl border-gray-200 rounded-xl py-4"
                      placeholder="0.00"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between text-lg font-medium">
                    <span className="text-gray-600">Total:</span>
                    <span className="text-gray-900">₱{total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-medium mt-2">
                    <span className="text-gray-600">Change Due:</span>
                    <span className={`text-xl font-bold ${changeDue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₱{changeDue >= 0 ? changeDue.toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setMethod(null)}
                    className="flex-1 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={changeDue < 0}
                    className="flex-1 py-3 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Complete Transaction
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-8">
                {isProcessing ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-16 w-16 text-indigo-600 animate-spin mb-4" />
                    <p className="text-lg font-medium text-gray-900">Processing on terminal...</p>
                    <p className="text-sm text-gray-500 mt-2">Please tap, insert, or swipe card.</p>
                  </div>
                ) : cardSuccess ? (
                  <div className="flex flex-col items-center animate-bounce-in">
                    <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                    <p className="text-xl font-bold text-gray-900">Approved!</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-indigo-50 p-6 rounded-full inline-block">
                      <CreditCard className="h-12 w-12 text-indigo-600" />
                    </div>
                    <p className="text-lg text-gray-600">Ready to charge <strong>${total.toFixed(2)}</strong></p>
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={() => setMethod(null)}
                        className="flex-1 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleCardProcess}
                        className="flex-1 py-3 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-all"
                      >
                        Charge Card
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
