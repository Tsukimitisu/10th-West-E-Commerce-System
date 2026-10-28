import Modal from '../../components/owner/Modal';
import BrandButton from '../../components/ui/BrandButton';
import OrderSummary from '../../components/customer/OrderSummary';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ChevronRight, ArrowLeft, LogIn } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getCurrentAuthUser } from '../../services/authSession.js';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import { MAX_ITEM_QUANTITY, MAX_ITEM_QUANTITY_MESSAGE } from '../../constants/commerce.js';
import { getShippingConfig } from '../../services/api.js';

const CART_VAT_RATE = 0.12;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 3000;
const CART_STANDARD_SHIPPING_FEE = 150;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => {
  const parsed = toFiniteNumber(value, 0);
  return Math.round(parsed * 100) / 100;
};

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
    total,
    updatingItemIds,
    syncCart,
    cartSyncError,
    cartPriceChanges,
    cartNotices,
  } = useCart();

  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [quantityErrors, setQuantityErrors] = useState({});
  const [localQuantities, setLocalQuantities] = useState({});
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(DEFAULT_FREE_SHIPPING_THRESHOLD);
  const [cartChanges, setCartChanges] = useState([]);
  const [checkoutError, setCheckoutError] = useState('');
  const previousPrices = useRef(new Map());

  useEffect(() => {
    syncCart({ forceGuest: true });
  }, []);

  useEffect(() => {
    let active = true;
    getShippingConfig()
      .then((config) => {
        const configuredThreshold = Number(config?.free_shipping_threshold);
        if (active && Number.isFinite(configuredThreshold) && configuredThreshold >= 0) {
          setFreeShippingThreshold(configuredThreshold);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const freeShippingApplied = subtotal >= freeShippingThreshold;
  const amountNeededForFreeShipping = roundCurrency(Math.max(0, freeShippingThreshold - subtotal));
  const shippingFee = freeShippingApplied ? 0 : CART_STANDARD_SHIPPING_FEE;
  const vatBase = roundCurrency(Math.max(0, toFiniteNumber(total, 0) + shippingFee));
  const vatAmount = roundCurrency(vatBase * CART_VAT_RATE);
  const grandTotal = roundCurrency(vatBase + vatAmount);

  const formatPrice = (price) => `\u20B1${roundCurrency(price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const priceNotices = [...new Set([
    ...cartPriceChanges.map((change) => `${change.name}: price updated to ${formatPrice(change.currentPrice)}.`),
    ...cartChanges,
    ...cartNotices,
  ])];

  const getEffectiveItemUnitPrice = (item) => {
    const regularPrice = toFiniteNumber(item?.product?.price, 0);
    const salePrice = item?.product?.sale_price == null ? NaN : toFiniteNumber(item.product.sale_price, NaN);
    const isOnSale = Boolean(item?.product?.is_on_sale);

    if (isOnSale && Number.isFinite(salePrice)) {
      return roundCurrency(salePrice);
    }

    return roundCurrency(regularPrice);
  };

  useEffect(() => {
    const nextPrices = new Map();
    const changes = [];
    for (const item of items) {
      const price = getEffectiveItemUnitPrice(item);
      const prior = previousPrices.current.get(item.productId);
      if (prior !== undefined && prior !== price) changes.push(`${item.product.name}: price updated to ${formatPrice(price)}.`);
      nextPrices.set(item.productId, price);
    }
    previousPrices.current = nextPrices;
    if (changes.length) setCartChanges(changes);
  }, [items]);

  const handleCheckout = () => {
    const invalid = items.find((item) => selectedItemIds.includes(item.productId)
      && (item.isAvailable === false || (item.product.stock_quantity != null
      && Number(item.product.stock_quantity) < Number(item.quantity))));
    if (invalid) {
      setCheckoutError(invalid.warning ? `${invalid.product.name}: ${invalid.warning}.` : `${invalid.product.name} has ${invalid.product.stock_quantity} available. Adjust the quantity before checkout.`);
      return;
    }
    setCheckoutError('');
    const checkoutSelectionIds = persistCheckoutSelection();
    if (checkoutSelectionIds.length === 0) return;

    if (!getCurrentAuthUser()) {
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

    if (val > MAX_ITEM_QUANTITY) {
      val = MAX_ITEM_QUANTITY;
      errorMsg = MAX_ITEM_QUANTITY_MESSAGE;
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
    if (item.quantity >= MAX_ITEM_QUANTITY) {
      setQuantityErrors((prev) => ({ ...prev, [item.productId]: MAX_ITEM_QUANTITY_MESSAGE }));
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
    <div className="commerce-page min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-10">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-5">
          <Link to="/" className="hover:text-red-600 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <span className="text-slate-900 font-semibold">Shopping Cart</span>
        </div>
        <h1 className="font-display font-bold text-3xl text-slate-900 mb-8">
          Shopping Cart {items.length > 0 && <span className="text-slate-500 font-medium text-xl">({items.length} items)</span>}
        </h1>

        {cartSyncError && <div role="alert" className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
          {cartSyncError} <button type="button" onClick={() => syncCart()} className="ml-2 font-semibold underline">Retry</button>
        </div>}
        {priceNotices.length > 0 && <div role="status" className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
          <p className="font-semibold">Cart prices were refreshed</p>
          {priceNotices.map((change) => <p key={change}>{change}</p>)}
        </div>}
        {checkoutError && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{checkoutError}</p>}

        {items.length === 0 && !cartSyncError ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={24} className="text-slate-700" />
            </div>
            <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">Your cart is empty</h2>
            <p className="text-slate-500 mb-8">Find the parts you need for your next ride.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-colors">
              Start Shopping <ArrowRight size={18} />
            </Link>
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
            <div className="lg:col-span-8">
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)_7.75rem_minmax(7.5rem,auto)] gap-4 px-6 py-3.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <div className="min-w-0 flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label="Select all cart items"
                  checked={selectedItemIds.length === items.length && items.length > 0}
                      onChange={(e) => toggleAllSelection(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 cursor-pointer"
                    />
                    <span>Product</span>
                  </div>
                  <div className="min-w-[7rem] text-center">Price</div>
                  <div className="w-[7.75rem] text-center">Quantity</div>
                  <div className="min-w-[7.5rem] text-right">Total</div>
                </div>

                {items.map((item, i) => {
                  const price = getEffectiveItemUnitPrice(item);
                  const isUpdating = updatingItemIds?.has(item.productId);
                  return (
                    <div key={item.productId} className={`p-4 md:px-6 md:py-5 hover:bg-slate-50/50 transition-colors ${i < items.length - 1 ? 'border-b border-slate-200' : ''}`}>
                      <div data-testid={`cart-row-${item.productId}`} className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)_7.75rem_minmax(7.5rem,auto)] md:gap-4 md:items-center">
                        <div className="min-w-0 flex gap-4 items-center">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.product.name}`}
                            checked={selectedItemIds.includes(item.productId)}
                            onChange={() => toggleSelection(item.productId)}
                            className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0"
                          />
                          <Link to={`/products/${item.productId}`} className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-slate-200">
                            <img src={resolveProductImageUrl(item.product.image)} alt={item.product.name} onError={handleProductImageError} className="w-full h-full object-cover" />
                          </Link>
                          <div className="min-w-0">
                            <Link to={`/products/${item.productId}`} className="font-semibold text-slate-900 hover:text-red-600 transition-colors text-sm line-clamp-2">{item.product.name}</Link>
                            {(item.product.part_number || item.product.sku) && <p className="text-xs text-slate-600 mt-1">Part # {item.product.part_number || item.product.sku}</p>}
                            {(item.product.motorcycle_model || item.product.category_name) && <p className="text-sm text-slate-600 mt-1">{item.product.motorcycle_model || item.product.category_name}</p>}
                            {item.product.stock_quantity != null && (
                              <p className={`text-xs mt-1 ${Number(item.product.stock_quantity) < Number(item.quantity) ? 'font-semibold text-red-700' : 'text-slate-600'}`}>
                                {Number(item.product.stock_quantity) <= 0 ? 'Unavailable' : `${item.product.stock_quantity} available`}
                              </p>
                            )}
                            <div className="flex gap-3 mt-2 md:hidden">
                              <button onClick={() => handleRemoveItem(item.productId)} className="inline-flex min-h-11 items-center gap-1 text-sm text-red-700"><Trash2 size={16} aria-hidden="true" /> Remove</button>
                            </div>
                          </div>
                        </div>

                        <div data-testid="cart-unit-price" className="hidden min-w-[7rem] text-center md:block">
                          <span className="whitespace-nowrap text-sm font-semibold text-slate-900">{formatPrice(price)}</span>
                          {item.product.is_on_sale && item.product.sale_price && (
                            <span className="block whitespace-nowrap text-xs text-slate-500 line-through">{formatPrice(item.product.price)}</span>
                          )}
                        </div>

                        <div data-testid="cart-quantity" className="flex w-[7.75rem] justify-center mt-3 md:mt-0">
                          <div className="flex shrink-0 items-center border border-slate-200 rounded-lg bg-slate-50">
                            <button aria-label={`Decrease quantity of ${item.product.name}`} onClick={() => handleDecreaseQty(item)} className="min-h-11 min-w-11 px-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50" disabled={item.quantity <= 1 || isUpdating}>
                              <Minus size={14} />
                            </button>
                            <input
                              aria-label={`Quantity of ${item.product.name}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={localQuantities[item.productId] !== undefined ? localQuantities[item.productId] : item.quantity}
                              onChange={(e) => handleQuantityInputChange(item, e.target.value)}
                              onBlur={() => handleQuantityBlur(item)}
                              disabled={isUpdating}
                              className="w-12 py-1 text-sm font-semibold text-center bg-transparent text-slate-900 focus:outline-none focus:bg-white transition-colors disabled:opacity-50"
                            />
                            <button aria-label={`Increase quantity of ${item.product.name}`} onClick={() => handleIncreaseQty(item)} disabled={isUpdating} className="min-h-11 min-w-11 px-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50">
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        <div data-testid="cart-line-total" className="flex min-w-[7.5rem] items-center justify-between gap-3 mt-3 md:mt-0 md:justify-end">
                          <span className="whitespace-nowrap text-sm font-bold text-slate-900 md:mr-2">{formatPrice(price * Math.max(0, toFiniteNumber(item.quantity, 0)))}</span>
                          <button aria-label={`Remove ${item.product.name}`} onClick={() => handleRemoveItem(item.productId)} disabled={isUpdating} className="hidden md:block p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {quantityErrors[item.productId] && (
                        <p className="text-xs text-red-600 mt-2">{quantityErrors[item.productId]}</p>
                      )}
                      {isUpdating && (
                        <p className="text-xs text-slate-500 mt-2" role="status">Updating…</p>
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
              <OrderSummary>
                <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 font-medium" role="status">
                  <p>Free shipping applies when your order subtotal reaches {formatPrice(freeShippingThreshold)} before shipping fees.</p>
                  <p className="mt-1">
                    {freeShippingApplied
                      ? 'Free shipping applied.'
                      : `${formatPrice(amountNeededForFreeShipping)} more to unlock free shipping.`}
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({selectedItemCount} items)</span>
                    <span className="font-semibold text-slate-900">{formatPrice(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount {discount?.code && `(${discount.code})`}</span>
                      <span className="font-semibold">-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Estimated shipping</span>
                    <span className="text-emerald-700 font-semibold">{shippingFee === 0 ? 'Free' : formatPrice(shippingFee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>VAT (12%)</span>
                    <span className="font-semibold text-slate-900">{formatPrice(vatAmount)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between">
                    <span className="font-semibold text-slate-900">Estimated total</span>
                    <span className="font-bold text-2xl text-slate-900">{formatPrice(grandTotal)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">Your final delivery fee and total are calculated from your address at checkout before you place the order.</p>

                <button
                  disabled={selectedItemIds.length === 0}
                  onClick={handleCheckout}
                  className={`w-full mt-6 py-3.5 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm ${selectedItemIds.length === 0 ? 'bg-slate-200 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-500 shadow-sm'}`}
                >
                  Proceed to Checkout <ArrowRight size={16} />
                </button>

                <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  Secure checkout
                </div>
              </OrderSummary>
            </div>
          </div>
        ) : null}
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

const LoginRequiredModal = ({ isOpen, onClose, onLogin }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Sign in to checkout" size="sm">
    <div className="p-6">
      <p className="text-sm leading-6 text-slate-600">Your cart is saved. Sign in or create an account to continue to secure checkout.</p>
      <div className="mt-5 flex flex-col gap-3">
        <BrandButton onClick={onLogin}><LogIn size={17} aria-hidden="true" />Sign In</BrandButton>
        <BrandButton variant="secondary" onClick={onClose}>Continue Shopping</BrandButton>
      </div>
    </div>
  </Modal>
);

export default Cart;
