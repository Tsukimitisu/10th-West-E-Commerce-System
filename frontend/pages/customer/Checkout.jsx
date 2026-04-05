import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ChevronRight, CreditCard, MapPin, Truck, Tag, X, Shield } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getAddresses, createOrder, createPaymentIntent, getProductById, validateDiscountCode } from '../../services/api';
import AddressDropdowns from '../../components/AddressDropdowns';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import MapPinPicker from '../../components/MapPinPicker';

const BUY_NOW_SESSION_KEY = 'shopCoreBuyNowSession';
const CHECKOUT_TERMS_SESSION_KEY = 'checkoutTermsAccepted';
const CHECKOUT_VAT_RATE = 0.12;
const CHECKOUT_FREE_STANDARD_SHIPPING_THRESHOLD = 2500;
const CHECKOUT_STANDARD_SHIPPING_FEE = 150;
const CHECKOUT_EXPRESS_SHIPPING_FEE = 300;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => {
  const parsed = toFiniteNumber(value, 0);
  return Math.round(parsed * 100) / 100;
};

const Checkout = () => {
  const {
    items: allCartItems,
    selectedItemIds,
    discount: cartDiscount,
    discountAmount: cartDiscountAmount,
    applyDiscount: applyCartDiscount,
    removeDiscount: removeCartDiscount,
    clearItemsByIds,
    updateQuantity,
    persistCheckoutSelection,
    getCheckoutSelection,
    clearCheckoutSelection,
  } = useCart();

  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isBuyNowQuery = searchParams.get('buyNow') === '1';
  const isBuyNow = isBuyNowQuery;

  const normalizeIdList = (ids = []) => {
    return Array.from(new Set(Array.isArray(ids) ? ids : []))
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
  };

  const areSameIds = (left = [], right = []) => {
    if (left.length !== right.length) return false;
    return left.every((id, index) => id === right[index]);
  };

  const [checkoutItemIds, setCheckoutItemIds] = useState(() => {
    const routeSelection = Array.isArray(location.state?.checkoutSelectionIds)
      ? location.state.checkoutSelectionIds
      : null;
    const storedSelection = getCheckoutSelection();
    const fallbackSelection = Array.isArray(selectedItemIds) ? selectedItemIds : [];
    const preferredSelection = routeSelection?.length
      ? routeSelection
      : storedSelection?.length
        ? storedSelection
        : fallbackSelection;
    return normalizeIdList(preferredSelection);
  });

  useEffect(() => {
    if (isBuyNow) return;

    const routeSelection = normalizeIdList(location.state?.checkoutSelectionIds);
    if (routeSelection.length === 0) return;

    setCheckoutItemIds((current) => (areSameIds(current, routeSelection) ? current : routeSelection));
  }, [isBuyNow, location.key, location.state]);

  const buyNowSessionStore = useMemo(() => {
    try {
      const stored = sessionStorage.getItem(BUY_NOW_SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const buyNowSession = useMemo(() => {
    if (!isBuyNowQuery || !buyNowSessionStore?.item) return null;

    const routeSessionId = location.state?.buyNowSessionId;
    if (routeSessionId && buyNowSessionStore.sessionId !== routeSessionId) {
      return null;
    }

    return buyNowSessionStore;
  }, [isBuyNowQuery, buyNowSessionStore, location.state]);

  const buyNowItem = buyNowSession?.item || null;

  const [buyNowQty, setBuyNowQty] = useState(1);
  const [buyNowDiscount, setBuyNowDiscount] = useState(null);
  const [buyNowDiscountAmount, setBuyNowDiscountAmount] = useState(0);

  useEffect(() => {
    if (buyNowItem) {
      setBuyNowQty(buyNowItem.quantity || 1);
    }
  }, [buyNowItem]);

  useEffect(() => {
    if (!isBuyNowQuery) {
      sessionStorage.removeItem(BUY_NOW_SESSION_KEY);
    }
  }, [isBuyNowQuery]);

  useEffect(() => {
    if (!isBuyNow && checkoutItemIds.length === 0) {
      clearCheckoutSelection();
    }
  }, [clearCheckoutSelection, checkoutItemIds, isBuyNow]);

  useEffect(() => {
    if (isBuyNow) return;

    if (checkoutItemIds.length === 0) {
      clearCheckoutSelection();
      return;
    }

    persistCheckoutSelection(checkoutItemIds);
  }, [checkoutItemIds, clearCheckoutSelection, isBuyNow, persistCheckoutSelection]);

  useEffect(() => {
    if (isBuyNow) return;

    const availableIds = new Set(allCartItems.map((item) => item.productId));
    const normalizeAvailable = (ids = []) => normalizeIdList(ids).filter((id) => availableIds.has(id));

    setCheckoutItemIds((current) => {
      const filteredCurrent = normalizeAvailable(current);
      const selectedFromCart = normalizeAvailable(selectedItemIds);
      const desired = selectedFromCart.length > 0 ? selectedFromCart : filteredCurrent;

      if (areSameIds(current, desired)) {
        return current;
      }

      return desired;
    });
  }, [allCartItems, isBuyNow, selectedItemIds]);

  const verifiedCartItems = useMemo(() => {
    if (isBuyNow) return [];
    const allowedIds = new Set(checkoutItemIds);
    return allCartItems.filter((item) => allowedIds.has(item.productId));
  }, [allCartItems, checkoutItemIds, isBuyNow]);

  const resolvedBuyNowQty = Math.max(1, Math.trunc(toFiniteNumber(buyNowQty, 1)));
  const items = isBuyNow ? (buyNowItem ? [{ ...buyNowItem, quantity: resolvedBuyNowQty }] : []) : verifiedCartItems;
  const activeDiscount = isBuyNow ? buyNowDiscount : cartDiscount;
  const activeDiscountAmount = isBuyNow ? buyNowDiscountAmount : cartDiscountAmount;

  const getEffectiveItemUnitPrice = (item) => {
    const regularPrice = toFiniteNumber(item?.product?.price, 0);
    const salePrice = toFiniteNumber(item?.product?.sale_price, NaN);
    const isOnSale = Boolean(item?.product?.is_on_sale);

    if (isOnSale && Number.isFinite(salePrice)) {
      return roundCurrency(salePrice);
    }

    return roundCurrency(regularPrice);
  };
  
  const calculatedCartSubtotal = useMemo(() => {
    const rawSubtotal = verifiedCartItems.reduce((sum, item) => {
      const quantity = Math.max(0, toFiniteNumber(item?.quantity, 0));
      const unitPrice = getEffectiveItemUnitPrice(item);
      return sum + (unitPrice * quantity);
    }, 0);
    return roundCurrency(rawSubtotal);
  }, [verifiedCartItems]);

  const buyNowSubtotal = buyNowItem
    ? roundCurrency(getEffectiveItemUnitPrice({ product: buyNowItem.product }) * resolvedBuyNowQty)
    : 0;
  const subtotal = isBuyNow ? buyNowSubtotal : calculatedCartSubtotal;
  const discountAmount = roundCurrency(Math.max(0, toFiniteNumber(activeDiscountAmount, 0)));
  const total = roundCurrency(Math.max(0, subtotal - discountAmount));

  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [agreeTerms, setAgreeTerms] = useState(() => {
    try {
      const storedAgreement = sessionStorage.getItem(CHECKOUT_TERMS_SESSION_KEY);
      return storedAgreement === null ? true : storedAgreement === 'true';
    } catch {
      return true;
    }
  });
  const [zipError, setZipError] = useState('');
  const [profile, setProfile] = useState(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    street: '', barangay: '', city: '', state: '', postal_code: '',
    lat: null, lng: null,
  });

  const [localQuantities, setLocalQuantities] = useState({});
  const [quantityErrors, setQuantityErrors] = useState({});
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
      updateCheckoutQuantity(item.productId, 1);
      setQuantityErrors(prev => { const next = { ...prev }; delete next[item.productId]; return next; });
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
       setQuantityErrors(prev => { const next = { ...prev }; delete next[item.productId]; return next; });
    }

    setLocalQuantities(prev => {
       const next = { ...prev };
       delete next[item.productId];
       return next;
    });

    if (val !== item.quantity) {
       updateCheckoutQuantity(item.productId, val);
    }
  };

  const updateCheckoutQuantity = (productId, quantity) => {
    if (!isBuyNow) {
      persistCheckoutSelection(checkoutItemIds);
    }
    updateQuantity(productId, quantity);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(CHECKOUT_TERMS_SESSION_KEY, String(agreeTerms));
    } catch {}
  }, [agreeTerms]);

  useEffect(() => {
    const user = localStorage.getItem('shopCoreUser');
    if (!user) return;

    const u = JSON.parse(user);
    setProfile(u);
    setForm((f) => ({
      ...f,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || f.phone || ''
    }));
    getAddresses(u.id).then((addrs) => {
      setAddresses(addrs);
      const def = addrs.find((a) => a.is_default);
      if (def) {
        setSelectedAddress(def.id);
        setForm((f) => ({
          ...f,
          name: def.recipient_name || f.name,
          phone: def.phone || f.phone
        }));
      } else if (addrs.length === 0) {
        setShowNewAddress(true);
      }
    }).catch(() => {});
  }, []);

  const shippingCost = shippingMethod === 'pickup'
    ? 0
    : shippingMethod === 'express'
      ? CHECKOUT_EXPRESS_SHIPPING_FEE
      : subtotal >= CHECKOUT_FREE_STANDARD_SHIPPING_THRESHOLD
        ? 0
        : CHECKOUT_STANDARD_SHIPPING_FEE;
  const vatBase = roundCurrency(Math.max(0, total + shippingCost));
  const vatAmount = roundCurrency(vatBase * CHECKOUT_VAT_RATE);
  const grandTotal = roundCurrency(vatBase + vatAmount);

  const formatPrice = (price) => {
    const safePrice = roundCurrency(price);
    return `PHP ${safePrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  };
  const digitsOnly = (value) => value.replace(/\D/g, '');
  const validateZip = (zip) => /^\d{4}$/.test(zip);

  const handleApplyPromo = async () => {
    setPromoError('');
    try {
      if (isBuyNow) {
        const result = await validateDiscountCode(promoCode, subtotal);
        setBuyNowDiscount(result?.discount || result);
        setBuyNowDiscountAmount(Number(result?.discountAmount ?? 0));
      } else {
        await applyCartDiscount(promoCode);
      }
    } catch (e) {
      setPromoError(e.message || 'Invalid promo code');
    }
  };

  const handleRemovePromo = () => {
    if (isBuyNow) {
      setBuyNowDiscount(null);
      setBuyNowDiscountAmount(0);
      setPromoError('');
      return;
    }
    removeCartDiscount();
  };

  const validateStockBeforeCheckout = async () => {
    const validations = await Promise.all(items.map(async (item) => {
      const fallbackStock = Math.max(0, Number(item.product?.stock_quantity ?? 0));
      const fallbackName = item.product?.name || `Product #${item.productId}`;

      try {
        const latest = await getProductById(item.productId);
        return {
          requested: item.quantity,
          available: Math.max(0, Number(latest?.stock_quantity ?? fallbackStock)),
          name: latest?.name || fallbackName,
        };
      } catch {
        return {
          requested: item.quantity,
          available: fallbackStock,
          name: fallbackName,
        };
      }
    }));

    const exceeded = validations.find((v) => v.requested > v.available);
    if (!exceeded) return null;

    return `${exceeded.name}: You requested ${exceeded.requested}, but the maximum available quantity is ${exceeded.available}.`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreeTerms) {
      setError('Please agree to the terms and conditions');
      return;
    }

const isNewAddressMode = showNewAddress || addresses.length === 0;
      const usingSavedAddress = selectedAddress && !isNewAddressMode;
      const selectedAddr = addresses.find((a) => a.id === selectedAddress);
      if (!usingSavedAddress && !isNewAddressMode) {
      setError('Please select a shipping address.');
      return;
    }

    if (usingSavedAddress && !selectedAddr) {
      setError('Please select a shipping address.');
      return;
    }
    if (usingSavedAddress && selectedAddr && selectedAddr.country && selectedAddr.country !== 'Philippines') {
      setError('Only Philippine addresses are allowed.');
      return;
    }

    const zipValid = usingSavedAddress ? true : validateZip(form.postal_code);
    if (!zipValid) {
      setError('Zip Code must contain exactly 4 digits.');
      setZipError('Zip Code must contain exactly 4 digits.');
      return;
    }

    if (!usingSavedAddress) {
      if (!form.name || !form.phone || !form.street || !form.city || !form.state || !form.postal_code) {
        setError('Please complete the shipping address and contact details.');
        return;
      }
    }

    setProcessing(true);
    setError('');

    try {
      const user = localStorage.getItem('shopCoreUser');
      const u = user ? JSON.parse(user) : null;

        const streetWithBarangay = form.barangay ? `${form.street}, ${form.barangay}` : form.street;
        if (!usingSavedAddress && form.lat && form.lng) {
          const key = `${streetWithBarangay}|${form.city}|${form.state}`;
          const stored = JSON.parse(localStorage.getItem('addressGeo') || '{}');
          stored[key] = { lat: form.lat, lng: form.lng };
          localStorage.setItem('addressGeo', JSON.stringify(stored));
        }
          
          const formatAddressParts = (parts) => parts.filter(p => p != null && p !== '').join(', ');
          const coordLabel = !usingSavedAddress && form.lat && form.lng ? ` (lat:${form.lat}, lng:${form.lng})` : '';
          let shippingAddress = '';
          if (selectedAddr) {
            const stateZip = [selectedAddr.state, selectedAddr.postal_code].filter(Boolean).join(' ');
            shippingAddress = formatAddressParts([
              selectedAddr.recipient_name,
              selectedAddr.street,
              selectedAddr.city,
              stateZip,
              'Philippines'
            ]);
          } else {
            const stateZip = [form.state, form.postal_code].filter(Boolean).join(' ');
            shippingAddress = formatAddressParts([
              form.name,
              streetWithBarangay,
              form.city,
              stateZip,
              `Philippines${coordLabel}`
            ]);
          }

      let shippingLat = usingSavedAddress ? (selectedAddr?.lat ?? null) : (form.lat ?? null);
      let shippingLng = usingSavedAddress ? (selectedAddr?.lng ?? null) : (form.lng ?? null);
      if (usingSavedAddress && (shippingLat == null || shippingLng == null) && selectedAddr) {
        try {
          const stored = JSON.parse(localStorage.getItem('addressGeo') || '{}');
          const key = `${selectedAddr.street}|${selectedAddr.city}|${selectedAddr.state}`;
          if (stored[key]) {
            shippingLat = stored[key].lat ?? shippingLat;
            shippingLng = stored[key].lng ?? shippingLng;
          }
        } catch {}
      }

      const stockError = await validateStockBeforeCheckout();
      if (stockError) {
        setError(stockError);
        setProcessing(false);
        return;
      }

      const shippingAddressSnapshot = {
        recipient_name: usingSavedAddress
          ? (selectedAddr?.recipient_name || form.name || profile?.name || null)
          : (form.name || profile?.name || null),
        phone: usingSavedAddress
          ? (selectedAddr?.phone || form.phone || profile?.phone || null)
          : (form.phone || profile?.phone || null),
        street: usingSavedAddress ? (selectedAddr?.street || null) : (form.street || null),
        barangay: usingSavedAddress ? (selectedAddr?.barangay || null) : (form.barangay || null),
        city: usingSavedAddress ? (selectedAddr?.city || null) : (form.city || null),
        state: usingSavedAddress ? (selectedAddr?.state || null) : (form.state || null),
        postal_code: usingSavedAddress ? (selectedAddr?.postal_code || null) : (form.postal_code || null),
        country: usingSavedAddress ? (selectedAddr?.country || 'Philippines') : 'Philippines',
        address_string: shippingAddress,
      };

      if (paymentMethod === 'card') {
        await createPaymentIntent(Math.round(grandTotal), items.map((i) => ({
          product_id: i.productId,
          quantity: Math.max(1, Math.trunc(toFiniteNumber(i.quantity, 1)))
        })), 'php');
      }

      const orderData = {
        user_id: u?.id,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: Math.max(1, Math.trunc(toFiniteNumber(i.quantity, 1))),
          price: getEffectiveItemUnitPrice(i),
          product_name: i.product?.name,
          product_price: getEffectiveItemUnitPrice(i)
        })),
        shipping_address: shippingAddress,
        shipping_address_snapshot: shippingAddressSnapshot,
        shipping_lat: shippingLat,
        shipping_lng: shippingLng,
        shipping_method: shippingMethod,
        total_amount: grandTotal,
        tax_amount: vatAmount,
        payment_method: paymentMethod,
        guest_info: !u ? { name: form.name, email: form.email } : undefined,
        discount_amount: discountAmount,
        promo_code_used: activeDiscount?.code,
      };

      const order = await createOrder(orderData);
      if (!isBuyNow) {
        await clearItemsByIds(checkoutItemIds);
        clearCheckoutSelection();
      } else {
        sessionStorage.removeItem(BUY_NOW_SESSION_KEY);
        clearCheckoutSelection();
      }
      navigate(`/order-confirmation/${order.id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">
            {isBuyNow ? 'Buy Now session expired' : 'Your cart is empty'}
          </h2>
          <Link
            to={isBuyNow ? (buyNowSessionStore?.returnPath || '/shop') : '/shop'}
            className="text-red-500 hover:text-red-600 text-sm font-medium"
          >
            {isBuyNow ? 'Return to Product' : 'Continue Shopping'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-red-500">Home</Link>
          <ChevronRight size={14} />
          {isBuyNow && items.length > 0 ? (
            <>
              <Link to={buyNowSession?.returnPath || `/products/${items[0].productId}`} className="hover:text-red-500">Product</Link>
              <ChevronRight size={14} />
            </>
          ) : (
            <>
              <Link to="/cart" className="hover:text-red-500">Cart</Link>
              <ChevronRight size={14} />
            </>
          )}
          <span className="text-gray-900 font-semibold">Checkout</span>
        </div>

        <h1 className="font-display font-bold text-3xl text-gray-900 mb-8">Checkout</h1>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-6">
              <Section title="Contact Information" icon={<MapPin size={18} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Full Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
                  <Input label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} required />
                  <Input
                    label="Phone"
                    type="tel"
                    value={form.phone}
                    onChange={(v) => setForm((f) => ({ ...f, phone: digitsOnly(v) }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="md:col-span-2"
                  />
                </div>
              </Section>

              <Section title="Shipping Address" icon={<MapPin size={18} />}>
                {addresses.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {addresses.map((addr) => (
                      <label key={addr.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${selectedAddress === addr.id ? 'border-red-500 bg-red-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <input
                          type="radio"
                          name="address"
                          checked={selectedAddress === addr.id}
                          onChange={() => {
                            setSelectedAddress(addr.id);
                            setShowNewAddress(false);
                            setZipError('');
                            setError('');
                            setForm((f) => ({
                              ...f,
                              name: addr.recipient_name || f.name,
                              phone: addr.phone || f.phone
                            }));
                          }}
                          className="mt-1 text-red-500 focus:ring-red-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{addr.recipient_name} {addr.is_default && <span className="text-xs text-red-500 ml-1">Default</span>}</p>
                          <p className="text-sm text-gray-400">{addr.street}, {addr.city}, {addr.state} {addr.postal_code}</p>
                          {addr.phone && <p className="text-sm text-gray-400">{addr.phone}</p>}
                        </div>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAddress(null);
                        setShowNewAddress(true);
                        setZipError('');
                        setForm((f) => ({
                          ...f,
                          name: profile?.name || f.name,
                          phone: profile?.phone || f.phone
                        }));
                      }}
                      className="text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      + Use a different address
                    </button>
                  </div>
                )}

                {selectedAddress && !showNewAddress && (
                  <div className="mb-4">
                    <MapPinPicker
                      street={addresses.find((a) => a.id === selectedAddress)?.street}
                      barangay={addresses.find((a) => a.id === selectedAddress)?.barangay || ''}
                      city={addresses.find((a) => a.id === selectedAddress)?.city}
                      state={addresses.find((a) => a.id === selectedAddress)?.state}
                      onChange={() => {}}
                      disabled
                    />
                  </div>
                )}

                {(addresses.length === 0 || showNewAddress) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <AddressDropdowns
                        province={form.state}
                        city={form.city}
                        barangay={form.barangay}
                        onChange={({ province, city, barangay }) => {
                          setForm((f) => ({
                            ...f,
                            state: province || '',
                            city: city || '',
                            barangay: barangay || '',
                            lat: null,
                            lng: null,
                          }));
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600 mb-1">Street / House No.</label>
                      <AddressAutocomplete
                        value={form.street}
                        onInputChange={(val) => setForm((f) => ({ ...f, street: val, lat: null, lng: null }))}
                        onSelect={(selected) => {
                          setForm((f) => ({
                            ...f,
                            street: selected.street || f.street,
                            barangay: selected.barangay || f.barangay,
                            city: selected.city || f.city,
                            state: selected.state || f.state,
                            postal_code: selected.postal_code || f.postal_code,
                            lat: selected.lat ?? null,
                            lng: selected.lng ?? null,
                          }));
                          setZipError(selected.postal_code ? '' : zipError);
                        }}
                        context={{
                          barangay: form.barangay,
                          city: form.city,
                          state: form.state,
                        }}
                        strictContext={Boolean(form.barangay || form.city || form.state)}
                        placeholder="House No. / Street"
                      />
                    </div>
                    {form.state && form.city && form.barangay && (
                      <div className="md:col-span-2">
                        <MapPinPicker
                          street={form.street}
                          barangay={form.barangay}
                          city={form.city}
                          state={form.state}
                          lat={form.lat}
                          lng={form.lng}
                          onChange={({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))}
                        />
                      </div>
                    )}
                    <Input
                      label="Postal Code"
                      value={form.postal_code}
                      onChange={(v) => {
                        const val = digitsOnly(v);
                        setForm((f) => ({ ...f, postal_code: val }));
                        setZipError(val.length === 0 || validateZip(val) ? '' : 'Zip Code must contain exactly 4 digits.');
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      error={zipError}
                      required={!selectedAddress}
                    />
                  </div>
                )}
              </Section>

              <Section title="Shipping Method" icon={<Truck size={18} />}>
                <div className="space-y-2">
                  {[
                    { id: 'standard', label: 'Standard Shipping', desc: '3-5 business days', price: subtotal >= CHECKOUT_FREE_STANDARD_SHIPPING_THRESHOLD ? 'Free' : `PHP ${CHECKOUT_STANDARD_SHIPPING_FEE.toFixed(2)}` },
                    { id: 'express', label: 'Express Shipping', desc: '1-2 business days', price: 'PHP 300.00' },
                    { id: 'pickup', label: 'Store Pickup', desc: 'Pick up at our store', price: 'Free' },
                  ].map((method) => (
                    <label key={method.id} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${shippingMethod === method.id ? 'border-red-500 bg-red-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" name="shipping" checked={shippingMethod === method.id} onChange={() => setShippingMethod(method.id)} className="text-red-500 focus:ring-red-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{method.label}</p>
                          <p className="text-xs text-gray-500">{method.desc}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-medium ${method.price === 'Free' ? 'text-green-600' : 'text-gray-900'}`}>{method.price}</span>
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Payment Method" icon={<CreditCard size={18} />}>
                <div className="space-y-2 mb-4">
                  {[
                    { id: 'card', label: 'Credit/Debit Card', desc: 'Visa, Mastercard' },
                    { id: 'gcash', label: 'GCash', desc: 'Pay via GCash e-wallet' },
                    { id: 'bank_transfer', label: 'Bank Transfer', desc: 'BDO, BPI, UnionBank, etc.' },
                    { id: 'cod', label: 'Cash on Delivery', desc: 'Pay when you receive' },
                  ].map((method) => (
                    <label key={method.id} className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${paymentMethod === method.id ? 'border-red-500 bg-red-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <input type="radio" name="payment" checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} className="text-red-500 focus:ring-red-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{method.label}</p>
                        <p className="text-xs text-gray-500">{method.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {paymentMethod === 'card' && (
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} className="text-green-600" />
                      <p className="text-sm font-medium text-gray-700">Secure Card Payment via Stripe</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Your card details are collected and processed securely by Stripe. Card numbers never touch our servers - fully PCI-DSS compliant.
                    </p>
                    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center text-sm text-gray-500" id="stripe-card-element">
                      <CreditCard size={24} className="mx-auto mb-2 text-gray-600" />
                      Stripe Card Element loads here
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 text-center">Protected by Stripe - 256-bit SSL encryption</p>
                  </div>
                )}

                {paymentMethod === 'gcash' && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-sm font-medium text-blue-700 mb-2">GCash Payment</p>
                    <p className="text-xs text-blue-600 mb-3">You will receive payment instructions after placing your order. Please send payment to our GCash number and upload your proof of payment.</p>
                    <Input label="GCash Number" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: digitsOnly(v) }))} inputMode="numeric" pattern="[0-9]*" placeholder="09XX XXX XXXX" />
                  </div>
                )}

                {paymentMethod === 'bank_transfer' && (
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-sm font-medium text-green-700 mb-2">Bank Transfer</p>
                    <p className="text-xs text-green-600 mb-3">After placing your order, bank account details for payment will be emailed to you along with your order confirmation. Your order will be processed once payment is confirmed.</p>
                  </div>
                )}
              </Section>
            </div>

            <div className="lg:w-96">
              <div className="bg-white rounded-xl border border-slate-200 p-6 sticky top-24 shadow-sm">
                <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">Order Summary</h2>

                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.productId} className="flex gap-3">
                      <div className="w-14 h-14 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                        <img src={item.product.image || 'https://via.placeholder.com/56'} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 line-clamp-1">{item.product.name}</p>
                        {isBuyNow ? (
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              type="button"
                              disabled={buyNowQty <= 1}
                              onClick={() => setBuyNowQty(Math.max(1, buyNowQty - 1))}
                              className="w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-700 text-xs transition-colors"
                            >
                              -
                            </button>
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*"
                              value={buyNowQty} 
                              onChange={(e) => {
                                const rawVal = e.target.value;
                                if (rawVal === '') {
                                  setBuyNowQty('');
                                  return;
                                }
                                let val = parseInt(rawVal, 10);
                                if (isNaN(val)) return;
                                const maxQty = 50;
                                const stock = Number(item.product.stock_quantity ?? Infinity);
                                if (val < 1) val = 1;
                                if (val > maxQty) val = maxQty;
                                if (Number.isFinite(stock) && val > stock) val = stock;
                                setBuyNowQty(val);
                                setError('');
                              }} 
                              onBlur={(e) => {
                                if (buyNowQty === '' || isNaN(parseInt(buyNowQty, 10))) {
                                  setBuyNowQty(1);
                                }
                              }}
                              className="text-xs text-gray-900 font-medium w-8 text-center bg-transparent border-none rounded focus:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-red-300 px-0 transition-colors"
                            />
                            <button
                              type="button"
                              disabled={buyNowQty >= (item.product.stock_quantity || 100) || buyNowQty >= 50}
                              onClick={() => setBuyNowQty(Math.min((item.product.stock_quantity || 100), Math.min(50, buyNowQty + 1)))}
                              className="w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-700 text-xs transition-colors"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                type="button"
                                disabled={item.quantity <= 1}
                                onClick={() => {
                                  updateCheckoutQuantity(item.productId, item.quantity - 1);
                                  setQuantityErrors(prev => { const next = { ...prev }; delete next[item.productId]; return next; });
                                }}
                                className="w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-700 text-xs transition-colors"
                              >
                                -
                              </button>
                              <input 
                                type="text" 
                                inputMode="numeric" 
                                pattern="[0-9]*"
                                value={localQuantities[item.productId] !== undefined ? localQuantities[item.productId] : item.quantity} 
                                onChange={(e) => handleQuantityInputChange(item, e.target.value)} 
                                onBlur={() => handleQuantityBlur(item)}
                                className="text-xs text-gray-900 font-medium w-8 text-center bg-transparent border-none rounded focus:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-red-300 px-0 transition-colors"
                              />
                              <button
                                type="button"
                                disabled={item.quantity >= (item.product.stock_quantity || 100) || item.quantity >= 50}
                                onClick={() => {
                                  const maxQty = 50;
                                  const stock = Number(item.product.stock_quantity ?? Infinity);
                                  if (item.quantity >= maxQty) {
                                    setQuantityErrors(prev => ({ ...prev, [item.productId]: `Maximum quantity limit is ${maxQty}.` }));
                                    return;
                                  }
                                  if (Number.isFinite(stock) && item.quantity >= stock) {
                                    setQuantityErrors(prev => ({ ...prev, [item.productId]: `Cannot exceed stock (${stock}).` }));
                                    return;
                                  }
                                  updateCheckoutQuantity(item.productId, item.quantity + 1);
                                  setQuantityErrors(prev => { const next = { ...prev }; delete next[item.productId]; return next; });
                                }}
                                className="w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-700 text-xs transition-colors"
                              >
                                +
                              </button>
                            </div>
                            {quantityErrors[item.productId] && (
                              <p className="text-[10px] text-red-500 mt-1">{quantityErrors[item.productId]}</p>
                            )}
                          </>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatPrice(getEffectiveItemUnitPrice(item) * Math.max(0, toFiniteNumber(item.quantity, 0)))}</span>
                    </div>
                  ))}
                </div>

                <div className="mb-4 pb-4 border-b border-slate-200">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Promo code"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 bg-gray-50 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <button type="button" onClick={handleApplyPromo} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">Apply</button>
                  </div>
                  {promoError && <p className="text-xs text-red-500 mt-1">{promoError}</p>}
                  {activeDiscount && (
                    <div className="flex items-center justify-between mt-2 p-2 bg-green-50 rounded-lg">
                      <span className="text-xs text-green-700 font-medium">{activeDiscount.code} applied!</span>
                      <button type="button" onClick={handleRemovePromo} className="text-xs text-green-600 hover:text-green-800"><X size={14} /></button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                  {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(discountAmount)}</span></div>}
                  <div className="flex justify-between text-gray-500"><span>Shipping</span><span className={shippingCost === 0 ? 'text-green-500 font-medium' : 'text-gray-600'}>{shippingCost === 0 ? 'Free' : formatPrice(shippingCost)}</span></div>
                  <div className="flex justify-between text-gray-400 text-xs"><span>VAT (12%)</span><span>{formatPrice(vatAmount)}</span></div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-2xl text-gray-900">{formatPrice(grandTotal)}</span></div>
                </div>

                  <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-300 bg-white accent-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-0"
                    />
                    <span className="text-xs leading-relaxed text-gray-700">
                      I agree to the <Link to="/terms" className="text-red-500 hover:underline">Terms & Conditions</Link> and <Link to="/privacy" className="text-red-500 hover:underline">Privacy Policy</Link>
                    </span>
                  </label>

                {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                <button
                  type="submit"
                  disabled={processing || !agreeTerms}
                  className="w-full mt-4 py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {processing ? (
                    <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</span>
                  ) : (
                    <span className="flex items-center gap-2"><Shield size={16} /> Place Order - {formatPrice(grandTotal)}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const Section = ({ title, icon, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-6">
    <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">{icon} {title}</h2>
    {children}
  </div>
);

const Input = ({ label, value, onChange, type = 'text', required, placeholder, className = '', inputMode, pattern, error }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-600 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      inputMode={inputMode}
      pattern={pattern}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-gray-900 bg-gray-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${error ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-red-500'}`}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

export default Checkout;



