import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CartDrawer = ({ isOpen, onClose }) => {
  const { items, updateQuantity, removeFromCart, subtotal, itemCount } = useCart();
  const navigate = useNavigate();

  const formatPrice = (p) => `â‚±${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-gray-900" />
            <span className="font-display font-semibold text-gray-900">Shopping Cart</span>
            <span className="text-sm text-gray-500">({itemCount})</span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={32} className="text-gray-300" />
            </div>
            <p className="font-medium text-gray-900 mb-1">Your cart is empty</p>
            <p className="text-sm text-gray-500 mb-6">Looks like you haven't added anything yet.</p>
            <button
              onClick={() => { onClose(); navigate('/shop'); }}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {items.map(item => (
                <div key={item.productId} className="flex gap-3 animate-fade-in">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                    <img src={item.product.image || 'https://via.placeholder.com/80'} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/products/${item.productId}`} onClick={onClose} className="text-sm font-medium text-gray-900 hover:text-red-600 transition-colors line-clamp-2">
                      {item.product.name}
                    </Link>
                    <p className="text-sm font-bold text-red-600 mt-1">
                      {formatPrice((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50 transition-colors"><Minus size={14} /></button>
                        <span className="px-3 py-1 text-sm font-medium min-w-[2rem] text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50 transition-colors"><Plus size={14} /></button>
                      </div>
                      <button onClick={() => removeFromCart(item.productId)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="font-bold text-gray-900 text-lg">{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs text-gray-400">Shipping & taxes calculated at checkout</p>
              <button
                onClick={() => { onClose(); navigate('/cart'); }}
                className="w-full py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                View Cart
              </button>
              <button
                onClick={() => { onClose(); navigate('/checkout'); }}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Checkout <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
