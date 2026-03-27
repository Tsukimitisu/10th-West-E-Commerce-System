import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, Heart, ShoppingBag, ArrowRight, ChevronRight, ArrowLeft, LogIn, X } from 'lucide-react';
import { useCart } from '../../context/CartContext';

const Cart = () => {
  const { 
    items, 
    selectedItemIds, 
    selectedItemCount,
    toggleSelection, 
    toggleAllSelection, 
    updateQuantity, 
    removeFromCart, 
    clearCart, 
    persistCheckoutSelection,
    subtotal, 
    discount, 
    discountAmount, 
    total 
  } = useCart();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [quantityErrors, setQuantityErrors] = useState({});
  const [localQuantities, setLocalQuantities] = useState({});

  const formatPrice = (p) => `₱${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const handleCheckout = () => {
    const checkoutSelectionIds = persistCheckoutSelection();
    if (checkoutSelectionIds.length === 0) {
      return;
    }

    const user = localStorage.getItem('shopCoreUser');
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    navigate('/checkout', { state: { checkoutSelectionIds } });
  };

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
       delete next[item.productId];
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

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/" className="hover:text-red-500 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <span className="text-white font-medium">Shopping Cart</span>
        </div>

        <h1 className="font-display font-bold text-2xl text-white mb-8">Shopping Cart {items.length > 0 && <span className="text-gray-400 font-normal text-lg">({items.length} items)</span>}</h1>

        {items.length === 0 ? (
          <div className="text-center py-20 bg-gray-800 rounded-2xl border border-gray-700">
            <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={40} className="text-gray-300" />
            </div>
            <h2 className="font-display font-semibold text-xl text-white mb-2">Your cart is empty</h2>
            <p className="text-gray-400 mb-8">Discover amazing motorcycle parts and accessories.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/100 hover:bg-red-600 text-white font-medium rounded-lg transition-colors">
              Start Shopping <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items */}
            <div className="flex-1">
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-900 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-700">
                  <div className="col-span-6 flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={selectedItemIds.length === items.length && items.length > 0} 
                      onChange={(e) => toggleAllSelection(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <span>Product</span>
                  </div>
                  <div className="col-span-2 text-center">Price</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {items.map((item, i) => {
                  const price = item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price;
                  return (
                    <div key={item.productId} className={`p-4 md:px-6 md:py-5 ${i < items.length - 1 ? 'border-b border-gray-700' : ''}`}>
                      <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center">
                        {/* Product */}
                        <div className="col-span-6 flex gap-4 items-center">
                          <input 
                            type="checkbox" 
                            checked={selectedItemIds.includes(item.productId)}
                            onChange={() => toggleSelection(item.productId)}
                            className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-orange-500 cursor-pointer flex-shrink-0"
                          />
                          <Link to={`/products/${item.productId}`} className="w-20 h-20 md:w-24 md:h-24 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0">
                            <img src={item.product.image || 'https://via.placeholder.com/96'} alt={item.product.name} className="w-full h-full object-cover" />
                          </Link>
                          <div className="min-w-0">
                            <Link to={`/products/${item.productId}`} className="font-medium text-white hover:text-red-500 transition-colors text-sm line-clamp-2">{item.product.name}</Link>
                            {item.product.category_name && <p className="text-xs text-gray-400 mt-1">{item.product.category_name}</p>}
                            {item.product.stock_quantity != null && (
                              <p className="text-xs text-gray-400 mt-1">Stock: {item.product.stock_quantity}</p>
                            )}
                            <div className="flex gap-3 mt-2 md:hidden">
                              <button onClick={() => handleRemoveItem(item.productId)} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                            </div>
                          </div>
                        </div>

                        {/* Price */}
                        <div className="col-span-2 text-center hidden md:block">
                          <span className="text-sm font-medium text-white">{formatPrice(price)}</span>
                          {item.product.is_on_sale && item.product.sale_price && (
                            <span className="block text-xs text-gray-400 line-through">{formatPrice(item.product.price)}</span>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="col-span-2 flex justify-center mt-3 md:mt-0">
                          <div className="flex items-center border border-gray-700 rounded-lg">
                            <button onClick={() => handleDecreaseQty(item)} className="px-2.5 py-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-900 transition-colors" disabled={item.quantity <= 1}>
                              <Minus size={14} />
                            </button>
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*"
                              value={localQuantities[item.productId] !== undefined ? localQuantities[item.productId] : item.quantity} 
                              onChange={(e) => handleQuantityInputChange(item, e.target.value)} 
                              onBlur={() => handleQuantityBlur(item)}
                              className="w-12 py-1 text-sm font-medium text-center bg-transparent text-white focus:outline-none focus:bg-gray-700 transition-colors"
                            />
                            <button onClick={() => handleIncreaseQty(item)} className="px-2.5 py-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-900 transition-colors">
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Total & Remove */}
                        <div className="col-span-2 flex items-center justify-between md:justify-end gap-3 mt-3 md:mt-0">
                          <span className="text-sm font-bold text-white md:mr-2">{formatPrice(price * item.quantity)}</span>
                          <button onClick={() => handleRemoveItem(item.productId)} className="hidden md:block p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {quantityErrors[item.productId] && (
                        <p className="text-xs text-red-500 mt-2">{quantityErrors[item.productId]}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-4">
                <Link to="/shop" className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-500 transition-colors">
                  <ArrowLeft size={16} /> Continue Shopping
                </Link>
                <button onClick={() => clearCart()} className="text-sm text-gray-400 hover:text-red-500 transition-colors">Clear Cart</button>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:w-96">
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 sticky top-24">
                <h2 className="font-display font-semibold text-lg text-white mb-4">Order Summary</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({selectedItemCount} items)</span>
                    <span className="font-medium text-white">{formatPrice(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount {discount?.code && `(${discount.code})`}</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className="text-green-600 font-medium">{subtotal >= 2500 ? 'Free' : '₱150.00'}</span>
                  </div>
                  <div className="border-t border-gray-700 pt-3 flex justify-between">
                    <span className="font-semibold text-white">Total</span>
                    <span className="font-bold text-xl text-white">{formatPrice(total + (subtotal < 2500 ? 150 : 0))}</span>
                  </div>
                </div>

<button 
                    disabled={selectedItemIds.length === 0}
                    onClick={handleCheckout} 
                    className={`w-full mt-6 py-3.5 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm ${selectedItemIds.length === 0 ? 'bg-orange-300 cursor-not-allowed' : 'bg-red-500/100 hover:bg-red-600'}`}
                  >
                  Proceed to Checkout <ArrowRight size={16} />
                </button>

                <div className="mt-4 flex items-center gap-2 justify-center text-xs text-gray-400">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
                  Secure checkout
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <LoginRequiredModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={() => {
          setShowLoginModal(false);
          navigate('/login?redirect=/checkout');
        }}
      />
    </div>
  );
};

// Login Required Modal
const LoginRequiredModal = ({ isOpen, onClose, onLogin }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={20} />
        </button>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn size={28} className="text-red-500" />
          </div>
          <h3 className="font-display font-bold text-lg text-white mb-2">Login Required</h3>
          <p className="text-sm text-gray-400 mb-6">You need to be logged in to proceed to checkout. Please sign in or create an account to continue.</p>
          <div className="space-y-3">
            <button
              onClick={onLogin}
              className="w-full py-3 bg-red-500/100 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <LogIn size={16} /> Sign In
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 border border-gray-700 text-gray-600 font-medium rounded-lg hover:bg-gray-900 transition-colors text-sm"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;


