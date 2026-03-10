import React, { useState, useRef, useEffect } from 'react';
import { ScanBarcode, Search, X, Plus, Minus, Trash2, Package, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { batchReceiveStock } from '../../services/api';

const ReceiveStock = ({ products, onComplete, onBack }) => {
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState([]); // [{ product, quantity }]
  const [notes, setNotes] = useState('');
  const [scanError, setScanError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  // Auto-focus the scan input
  useEffect(() => {
    if (!result) inputRef.current?.focus();
  }, [cart, result]);

  const findProduct = (code) => {
    const term = code.trim().toLowerCase();
    if (!term) return null;
    return products.find(p =>
      p.barcode?.toLowerCase() === term ||
      p.partNumber?.toLowerCase() === term ||
      p.part_number?.toLowerCase() === term ||
      p.sku?.toLowerCase() === term
    );
  };

  const handleScan = (e) => {
    e.preventDefault();
    setScanError('');
    const product = findProduct(scanInput);

    if (!product) {
      setScanError(`No product found for "${scanInput}"`);
      return;
    }

    // Check if already in cart - increment quantity
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }

    setScanInput('');
  };

  const updateQuantity = (productId, newQty) => {
    if (newQty < 1) return;
    setCart(cart.map(item =>
      item.product.id === productId
        ? { ...item, quantity: newQty }
        : item
    ));
  };

  const removeItem = (productId) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const items = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity
      }));
      const res = await batchReceiveStock(items, notes);
      setResult(res);
      if (onComplete) onComplete();
    } catch (err) {
      setSubmitError(err?.message || 'Failed to receive stock. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setNotes('');
    setResult(null);
    setSubmitError('');
    setScanError('');
    setScanInput('');
  };

  // Success screen
  if (result) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Stock Received Successfully</h2>
          <p className="text-sm text-gray-500 mb-6">
            {result.success_count} of {result.total_items} items processed
          </p>

          <div className="bg-gray-50 rounded-lg p-4 max-w-md mx-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Product</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">Added</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">New Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.results?.filter(r => r.success).map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-900">{r.name}</td>
                    <td className="py-2 text-right text-green-600 font-medium">+{r.quantity_added}</td>
                    <td className="py-2 text-right font-bold text-gray-900">{r.new_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.failed_count > 0 && (
            <div className="bg-red-50 rounded-lg p-3 max-w-md mx-auto mb-4 text-sm text-red-600">
              {result.failed_count} item(s) failed to process
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button onClick={resetForm} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
              Receive More Items
            </button>
            {onBack && (
              <button onClick={onBack} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                Back to Inventory
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
          )}
          <div>
            <h2 className="font-display font-bold text-lg text-gray-900 flex items-center gap-2">
              <ScanBarcode size={20} className="text-orange-500" />
              Receive Stock
            </h2>
            <p className="text-xs text-gray-500">Scan barcodes or enter part numbers to receive inventory</p>
          </div>
        </div>
        {cart.length > 0 && (
          <div className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full text-sm font-medium">
            {cart.length} product{cart.length !== 1 ? 's' : ''} • {totalItems} unit{totalItems !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Scan Input */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={e => { setScanInput(e.target.value); setScanError(''); }}
              placeholder="Scan barcode or enter Part Number / SKU..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            <Search size={14} /> Lookup
          </button>
        </form>
        {scanError && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            {scanError}
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          Scan a barcode or type a Part Number / SKU and press Enter. Items are added to the list below.
        </p>
      </div>

      {/* Cart / Items List */}
      {cart.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Items to Receive</h3>
            <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-600 font-medium">
              Clear All
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Product</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Current Stock</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 w-40">Qty to Add</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">New Stock</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cart.map(item => (
                <tr key={item.product.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                        {item.product.image ? (
                          <img src={item.product.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package size={14} className="m-auto text-gray-400 mt-1.5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.product.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {item.product.partNumber || item.product.part_number || item.product.sku || item.product.barcode || '-'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {item.product.stock_quantity}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (val >= 1) updateQuantity(item.product.id, val);
                        }}
                        className="w-16 text-center py-1 border border-gray-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-green-600">
                    {item.product.stock_quantity + item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Notes */}
          <div className="px-4 py-3 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-600 mb-1">Receiving Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. PO #12345, Supplier delivery..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          {/* Summary & Submit */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/80">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{cart.length}</span> product{cart.length !== 1 ? 's' : ''} •{' '}
                <span className="font-medium text-gray-900">{totalItems}</span> total unit{totalItems !== 1 ? 's' : ''} to receive
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    Confirm & Receive Stock
                  </>
                )}
              </button>
            </div>
            {submitError && (
              <div className="mt-2 p-2 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
                {submitError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty cart state */}
      {cart.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <ScanBarcode size={28} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 font-medium mb-1">No items scanned yet</p>
          <p className="text-xs text-gray-400">Scan a barcode or enter a Part Number above to start receiving stock</p>
        </div>
      )}
    </div>
  );
};

export default ReceiveStock;
