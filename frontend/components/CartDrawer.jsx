import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, LogIn } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CartDrawer = ({ isOpen, onClose }) => {
  const { 
    items, 
    selectedItemIds, 
    toggleSelection, 
    toggleAllSelection, 
    updateQuantity, 
    removeFromCart, 
    subtotal, 
    itemCount 
  } = useCart();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [quantityErrors, setQuantityErrors] = useState({});
  const [localQuantities, setLocalQuantities] = useState({});

  const formatPrice = (p) => `₱${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const clearQuantityError = (productId) => {
    setQuantityErrors((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleRemoveItem = (productId) => {
    clearQuantityError(productId);
    removeFromCart(productId);
  };

  const MAX_QUANTITY = 50;

  const handleQuantityInputChange = (item, rawValue) => {
    if (rawValue === '') {
      setLocalQuantities(prev => ({ ...prev, [item.productId]: '' }));
      return;
    }
    let val = parseInt(rawValue, 10);
    if (isNaN(val)) return;
    setLocalQuantities(prev => ({ ...prev, [item.productId]: val }));
  };

  const handleQuantityBlur = (item) => {
    const rawVal = localQuantities[item.productId];
    if (rawVal === undefined) return;

    if (rawVal === '' || isNaN(parseInt(rawVal, 10))) {
      setLocalQuantities(prev => ({ ...prev, [item.productId]: 1 }));
      updateQuantity(item.productId, 1);
      clearQuantityError(item.productId);
      return;
    }

    let val = parseInt(rawVal, 10);
    if (val < 1) val = 1;

    const stock = Number(item.product.stock_quantity ?? Infinity);
    let errorMsg = null;

    if (val > MAX_QUANTITY) {
      val = MAX_QUANTITY;
      errorMsg = `Maximum quantity limit is ${MAX_QUANTITY}.`;
    }
    if (Number.isFinite(stock) && val > stock) {
      val = stock;
      errorMsg = `Cannot exceed stock (${stock}).`;
    }

    if (errorMsg) {
       setQuantityErrors((prev) => ({ ...prev, [item.productId]: errorMsg }));
    } else {
       clearQuantityError(item.productId);
    }

    setLocalQuantities(prev => {
       const next = { ...prev };
       delete next[item.productId]; // clear local state to re-sync with context
       return next;
    });

    if (val !== item.quantity) {
       updateQuantity(item.productId, val);
    }
  };

  const handleIncreaseQty = (item) => {
    const stock = Number(item.product.stock_quantity ?? Infinity);
    if (item.quantity >= MAX_QUANTITY) {
      setQuantityErrors((prev) => ({ ...prev, [item.productId]: `Maximum quantity limit is ${MAX_QUANTITY}.` }));
      return;
    }
    if (Number.isFinite(stock) && item.quantity >= stock) {
      setQuantityErrors((prev) => ({ ...prev, [item.productId]: `Cannot exceed stock (${stock}).` }));
      return;
    }
    clearQuantityError(item.productId);
    updateQuantity(item.productId, item.quantity + 1);
  };

  const handleDecreaseQty = (item) => {
    clearQuantityError(item.productId);
    updateQuantity(item.productId, item.quantity - 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-[#f8fafc] shadow-2xl flex flex-col animate-fade-in border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <ShoppingBag size={17} className="text-slate-700" />
            </div>
            <span className="font-display font-semibold text-slate-900 text-xl">Shopping Cart</span>
            <span className="text-sm text-slate-500">({itemCount})</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={32} className="text-slate-600" />
            </div>
            <p className="font-semibold text-slate-900 mb-1">Your cart is empty</p>
            <p className="text-sm text-slate-500 mb-6">Looks like you haven't added anything yet.</p>
            <button
              onClick={() => { onClose(); navigate('/shop'); }}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <input 
                  type="checkbox" 
                  checked={selectedItemIds.length === items.length && items.length > 0} 
                  onChange={(e) => toggleAllSelection(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400"
                />
                <span className="text-sm font-medium text-slate-700">Select All items</span>
              </div>
              {items.map(item => (
                <div key={item.productId} className="animate-fade-in">
                  <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                    <div className="flex gap-3 items-start">
                      <input 
                        type="checkbox" 
                        checked={selectedItemIds.includes(item.productId)}
                        onChange={() => toggleSelection(item.productId)}
                        className="w-4 h-4 mt-7 rounded border-slate-300 text-red-600 focus:ring-red-400"
                      />
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        <img src={item.product.image || 'https://via.placeholder.com/80'} alt={item.product.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link to={`/products/${item.productId}`} onClick={onClose} className="text-sm font-semibold text-slate-900 hover:text-red-600 transition-colors line-clamp-2">
                          {item.product.name}
                        </Link>
                        {item.product.stock_quantity != null && (
                          <p className="text-xs text-slate-500 mt-0.5">Stock: {item.product.stock_quantity}</p>
                        )}
                        <p className="text-sm font-bold text-red-500 mt-1">
                          {formatPrice((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity)}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
                            <button onClick={() => handleDecreaseQty(item)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-200 transition-colors" disabled={item.quantity <= 1}><Minus size={14} /></button>
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*"
                              value={localQuantities[item.productId] !== undefined ? localQuantities[item.productId] : item.quantity} 
                              onChange={(e) => handleQuantityInputChange(item, e.target.value)} 
                              onBlur={() => handleQuantityBlur(item)}
                              className="w-10 py-1 text-sm font-medium text-center bg-transparent text-slate-900 focus:outline-none focus:bg-white transition-colors"
                            />
                            <button onClick={() => handleIncreaseQty(item)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-200 transition-colors"><Plus size={14} /></button>
                          </div>
                          <button onClick={() => handleRemoveItem(item.productId)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {quantityErrors[item.productId] && (
                          <p className="text-xs text-red-600 mt-1">{quantityErrors[item.productId]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 p-4 sm:p-5 space-y-3 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Subtotal</span>
                <span className="font-bold text-slate-900 text-2xl">{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs text-slate-500">Shipping & taxes calculated at checkout</p>
              <button
                onClick={() => { onClose(); navigate('/cart'); }}
                className="w-full py-3 border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors"
              >
                View Cart
              </button>
              <button
                disabled={selectedItemIds.length === 0}
                onClick={() => {
                  if (selectedItemIds.length === 0) return;
                  const user = localStorage.getItem('shopCoreUser');
                  if (!user) {
                    setShowLoginModal(true);
                  } else {
                    onClose();
                    navigate('/checkout');
                  }
                }}
                className={`w-full py-3 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 ${selectedItemIds.length === 0 ? 'bg-red-200 cursor-not-allowed' : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'}`}
              >
                Checkout <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* Login Required Modal */}
        {showLoginModal && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowLoginModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-xs w-full mx-4 p-6 border border-slate-200">
              <button onClick={() => setShowLoginModal(false)} className="absolute top-3 right-3 p-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
              <div className="text-center">
                <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <LogIn size={24} className="text-red-500" />
                </div>
                <h3 className="font-display font-bold text-base text-slate-900 mb-1">Login Required</h3>
                <p className="text-sm text-slate-600 mb-5">You need to sign in to proceed to checkout.</p>
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowLoginModal(false); onClose(); navigate('/login?redirect=/checkout'); }}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <LogIn size={16} /> Sign In
                  </button>
                  <button
                    onClick={() => setShowLoginModal(false)}
                    className="w-full py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;


