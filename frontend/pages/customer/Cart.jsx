import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ChevronRight, ArrowLeft, LogIn, X } from 'lucide-react';
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

  const shippingFee = subtotal >= 2500 ? 0 : 150;
  const grandTotal = total + shippingFee;

  const formatPrice = (p) => `\u20B1${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const handleCheckout = () => {
    const checkoutSelectionIds = persistCheckoutSelection();
    if (checkoutSelectionIds.length === 0) return;

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
    const val = parseInt(rawValue, 10);
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
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-white to-[#f9fafb]">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-10">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-5">
          <Link to="/" className="hover:text-red-600 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <span className="text-slate-900 font-semibold">Shopping Cart</span>
        </div>
        <h1 className="font-display font-bold text-3xl text-slate-900 mb-8">
          Shopping Cart {items.length > 0 && <span className="text-slate-500 font-medium text-xl">({items.length} items)</span>}
        </h1>

        {items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={40} className="text-red-500" />
            </div>
            <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">Your cart is empty</h2>
            <p className="text-slate-500 mb-8">Discover amazing motorcycle parts and accessories.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
              Start Shopping <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
            <div className="lg:col-span-8">
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <div className="col-span-6 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.length === items.length && items.length > 0}
                      onChange={(e) => toggleAllSelection(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 cursor-pointer"
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
                    <div key={item.productId} className={`p-4 md:px-6 md:py-5 hover:bg-red-50/30 transition-colors ${i < items.length - 1 ? 'border-b border-slate-200' : ''}`}>
                      <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center">
                        <div className="col-span-6 flex gap-4 items-center">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.productId)}
                            onChange={() => toggleSelection(item.productId)}
                            className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0"
                          />
                          <Link to={`/products/${item.productId}`} className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-slate-200">
                            <img src={item.product.image || 'https://via.placeholder.com/96'} alt={item.product.name} className="w-full h-full object-cover" />
                          </Link>
                          <div className="min-w-0">
                            <Link to={`/products/${item.productId}`} className="font-semibold text-slate-900 hover:text-red-600 transition-colors text-sm line-clamp-2">{item.product.name}</Link>
                            {item.product.category_name && <p className="text-xs text-slate-500 mt-1">{item.product.category_name}</p>}
                            {item.product.stock_quantity != null && (
                              <p className="text-xs text-slate-500 mt-1">Stock: {item.product.stock_quantity}</p>
                            )}
                            <div className="flex gap-3 mt-2 md:hidden">
                              <button onClick={() => handleRemoveItem(item.productId)} className="text-xs text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 text-center hidden md:block">
                          <span className="text-sm font-semibold text-slate-900">{formatPrice(price)}</span>
                          {item.product.is_on_sale && item.product.sale_price && (
                            <span className="block text-xs text-slate-500 line-through">{formatPrice(item.product.price)}</span>
                          )}
                        </div>

                        <div className="col-span-2 flex justify-center mt-3 md:mt-0">
                          <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                            <button onClick={() => handleDecreaseQty(item)} className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors" disabled={item.quantity <= 1}>
                              <Minus size={14} />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={localQuantities[item.productId] !== undefined ? localQuantities[item.productId] : item.quantity}
                              onChange={(e) => handleQuantityInputChange(item, e.target.value)}
                              onBlur={() => handleQuantityBlur(item)}
                              className="w-12 py-1 text-sm font-semibold text-center bg-transparent text-slate-900 focus:outline-none focus:bg-white transition-colors"
                            />
                            <button onClick={() => handleIncreaseQty(item)} className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="col-span-2 flex items-center justify-between md:justify-end gap-3 mt-3 md:mt-0">
                          <span className="text-sm font-bold text-slate-900 md:mr-2">{formatPrice(price * item.quantity)}</span>
                          <button onClick={() => handleRemoveItem(item.productId)} className="hidden md:block p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {quantityErrors[item.productId] && (
                        <p className="text-xs text-red-600 mt-2">{quantityErrors[item.productId]}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4">
                <Link to="/shop" className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 transition-colors font-medium">
                  <ArrowLeft size={16} /> Continue Shopping
                </Link>
                <button onClick={() => clearCart()} className="text-sm text-slate-500 hover:text-red-600 transition-colors">Clear Cart</button>
              </div>
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-24 shadow-sm">
                <h2 className="font-display font-semibold text-lg text-slate-900 mb-4">Order Summary</h2>
                <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 font-medium">
                  Free shipping on orders above \u20B12,500
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({selectedItemCount} items)</span>
                    <span className="font-semibold text-slate-900">{formatPrice(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount {discount?.code && `(${discount.code})`}</span>
                      <span className="font-semibold">-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span className="text-emerald-600 font-semibold">{shippingFee === 0 ? 'Free' : formatPrice(shippingFee)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-2xl text-slate-900">{formatPrice(grandTotal)}</span>
                  </div>
                </div>

                <button
                  disabled={selectedItemIds.length === 0}
                  onClick={handleCheckout}
                  className={`w-full mt-6 py-3.5 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-sm ${selectedItemIds.length === 0 ? 'bg-red-200 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'}`}
                >
                  Proceed to Checkout <ArrowRight size={16} />
                </button>

                <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
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

const LoginRequiredModal = ({ isOpen, onClose, onLogin }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 animate-fade-in border border-slate-200">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
          <X size={20} />
        </button>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn size={28} className="text-red-500" />
          </div>
          <h3 className="font-display font-bold text-lg text-slate-900 mb-2">Login Required</h3>
          <p className="text-sm text-slate-600 mb-6">You need to be logged in to proceed to checkout. Please sign in or create an account to continue.</p>
          <div className="space-y-3">
            <button
              onClick={onLogin}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <LogIn size={16} /> Sign In
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors text-sm"
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
