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

  const handleIncreaseQty = (item) => {
    const stock = Number(item.product.stock_quantity ?? Infinity);
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-gray-800 shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-white" />
            <span className="font-display font-semibold text-white">Shopping Cart</span>
            <span className="text-sm text-gray-400">({itemCount})</span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-900 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={32} className="text-gray-300" />
            </div>
            <p className="font-medium text-white mb-1">Your cart is empty</p>
            <p className="text-sm text-gray-400 mb-6">Looks like you haven't added anything yet.</p>
            <button
              onClick={() => { onClose(); navigate('/shop'); }}
              className="px-6 py-2.5 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-50">
                <input 
                  type="checkbox" 
                  checked={selectedItemIds.length === items.length && items.length > 0} 
                  onChange={(e) => toggleAllSelection(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700">Select All items</span>
              </div>
              {items.map(item => (
                <div key={item.productId} className="flex gap-3 animate-fade-in items-center">
                  <input 
                    type="checkbox" 
                    checked={selectedItemIds.includes(item.productId)}
                    onChange={() => toggleSelection(item.productId)}
                    className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-orange-500"
                  />
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0">
                    <img src={item.product.image || 'https://via.placeholder.com/80'} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/products/${item.productId}`} onClick={onClose} className="text-sm font-medium text-white hover:text-red-500 transition-colors line-clamp-2">
                      {item.product.name}
                    </Link>
                    {item.product.stock_quantity != null && (
                      <p className="text-xs text-gray-400 mt-0.5">Stock: {item.product.stock_quantity}</p>
                    )}
                    <p className="text-sm font-bold text-red-500 mt-1">
                      {formatPrice((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
                        <button onClick={() => handleDecreaseQty(item)} className="px-2 py-1 text-gray-400 hover:bg-gray-900 transition-colors"><Minus size={14} /></button>
                        <span className="px-3 py-1 text-sm font-medium min-w-[2rem] text-center">{item.quantity}</span>
                        <button onClick={() => handleIncreaseQty(item)} className="px-2 py-1 text-gray-400 hover:bg-gray-900 transition-colors"><Plus size={14} /></button>
                      </div>
                      <button onClick={() => handleRemoveItem(item.productId)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {quantityErrors[item.productId] && (
                      <p className="text-xs text-red-500 mt-1">{quantityErrors[item.productId]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-700 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Subtotal</span>
                <span className="font-bold text-white text-lg">{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs text-gray-400">Shipping & taxes calculated at checkout</p>
              <button
                onClick={() => { onClose(); navigate('/cart'); }}
                className="w-full py-3 border border-gray-700 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
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
                className={`w-full py-3 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${selectedItemIds.length === 0 ? 'bg-orange-300 cursor-not-allowed' : 'bg-red-500/100 hover:bg-red-600'}`}
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
            <div className="relative bg-gray-800 rounded-2xl shadow-2xl max-w-xs w-full mx-4 p-6">
              <button onClick={() => setShowLoginModal(false)} className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
              <div className="text-center">
                <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <LogIn size={24} className="text-red-500" />
                </div>
                <h3 className="font-display font-bold text-base text-white mb-1">Login Required</h3>
                <p className="text-sm text-gray-400 mb-5">You need to sign in to proceed to checkout.</p>
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowLoginModal(false); onClose(); navigate('/login?redirect=/checkout'); }}
                    className="w-full py-2.5 bg-red-500/100 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <LogIn size={16} /> Sign In
                  </button>
                  <button
                    onClick={() => setShowLoginModal(false)}
                    className="w-full py-2.5 border border-gray-700 text-gray-600 font-medium rounded-lg hover:bg-gray-900 transition-colors text-sm"
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


