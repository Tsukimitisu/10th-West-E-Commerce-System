import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, Heart, ShoppingBag, ArrowRight, ChevronRight, ArrowLeft, LogIn, X } from 'lucide-react';
import { useCart } from '../../context/CartContext';

const Cart = () => {
  const { items, updateQuantity, removeFromCart, clearCart, subtotal, discount, discountAmount, total } = useCart();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const formatPrice = (p) => `₱${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const handleCheckout = () => {
    const user = localStorage.getItem('shopCoreUser');
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-orange-500 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <span className="text-gray-900 font-medium">Shopping Cart</span>
        </div>

        <h1 className="font-display font-bold text-2xl text-gray-900 mb-8">Shopping Cart {items.length > 0 && <span className="text-gray-400 font-normal text-lg">({items.length} items)</span>}</h1>

        {items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={40} className="text-gray-300" />
            </div>
            <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Your cart is empty</h2>
            <p className="text-gray-500 mb-8">Discover amazing motorcycle parts and accessories.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors">
              Start Shopping <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items */}
            <div className="flex-1">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <div className="col-span-6">Product</div>
                  <div className="col-span-2 text-center">Price</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {items.map((item, i) => {
                  const price = item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price;
                  return (
                    <div key={item.productId} className={`p-4 md:px-6 md:py-5 ${i < items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center">
                        {/* Product */}
                        <div className="col-span-6 flex gap-4">
                          <Link to={`/products/${item.productId}`} className="w-20 h-20 md:w-24 md:h-24 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
                            <img src={item.product.image || 'https://via.placeholder.com/96'} alt={item.product.name} className="w-full h-full object-cover" />
                          </Link>
                          <div className="min-w-0">
                            <Link to={`/products/${item.productId}`} className="font-medium text-gray-900 hover:text-orange-500 transition-colors text-sm line-clamp-2">{item.product.name}</Link>
                            {item.product.category_name && <p className="text-xs text-gray-500 mt-1">{item.product.category_name}</p>}
                            <div className="flex gap-3 mt-2 md:hidden">
                              <button onClick={() => removeFromCart(item.productId)} className="text-xs text-gray-400 hover:text-orange-500 transition-colors flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                            </div>
                          </div>
                        </div>

                        {/* Price */}
                        <div className="col-span-2 text-center hidden md:block">
                          <span className="text-sm font-medium text-gray-900">{formatPrice(price)}</span>
                          {item.product.is_on_sale && item.product.sale_price && (
                            <span className="block text-xs text-gray-400 line-through">{formatPrice(item.product.price)}</span>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="col-span-2 flex justify-center mt-3 md:mt-0">
                          <div className="flex items-center border border-gray-200 rounded-lg">
                            <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="px-2.5 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                              <Minus size={14} />
                            </button>
                            <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="px-2.5 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Total & Remove */}
                        <div className="col-span-2 flex items-center justify-between md:justify-end gap-3 mt-3 md:mt-0">
                          <span className="text-sm font-bold text-gray-900 md:mr-2">{formatPrice(price * item.quantity)}</span>
                          <button onClick={() => removeFromCart(item.productId)} className="hidden md:block p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-4">
                <Link to="/shop" className="flex items-center gap-2 text-sm text-gray-600 hover:text-orange-500 transition-colors">
                  <ArrowLeft size={16} /> Continue Shopping
                </Link>
                <button onClick={() => clearCart()} className="text-sm text-gray-400 hover:text-orange-500 transition-colors">Clear Cart</button>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:w-96">
              <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
                <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">Order Summary</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({items.length} items)</span>
                    <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount {discount?.code && `(${discount.code})`}</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className="text-green-600 font-medium">{subtotal >= 2500 ? 'Free' : 'â‚±150.00'}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 flex justify-between">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-xl text-gray-900">{formatPrice(total + (subtotal < 2500 ? 150 : 0))}</span>
                  </div>
                </div>

                <button onClick={handleCheckout} className="w-full mt-6 py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm">
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
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={20} />
        </button>
        <div className="text-center">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn size={28} className="text-orange-500" />
          </div>
          <h3 className="font-display font-bold text-lg text-gray-900 mb-2">Login Required</h3>
          <p className="text-sm text-gray-500 mb-6">You need to be logged in to proceed to checkout. Please sign in or create an account to continue.</p>
          <div className="space-y-3">
            <button
              onClick={onLogin}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <LogIn size={16} /> Sign In
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
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
