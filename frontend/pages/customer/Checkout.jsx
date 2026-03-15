import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ChevronRight, CreditCard, MapPin, Truck, Tag, X, Shield } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getAddresses, createOrder, createPaymentIntent, getProductById } from '../../services/api';
import AddressDropdowns from '../../components/AddressDropdowns';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import MapPinPicker from '../../components/MapPinPicker';

const Checkout = () => {
  const { items: cartItems, subtotal: cartSubtotal, total: cartTotal, discount, discountAmount, applyDiscount, removeDiscount, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const isBuyNow = !!(location.state?.buyNowItem || sessionStorage.getItem('buyNowItem'));
  const buyNowItem = useMemo(() => {
    if (location.state?.buyNowItem) return location.state.buyNowItem;
    const stored = sessionStorage.getItem('buyNowItem');
    if (stored) {
      sessionStorage.removeItem('buyNowItem');
      return JSON.parse(stored);
    }
    return null;
  }, [location.state]);

  const items = isBuyNow && buyNowItem ? [buyNowItem] : cartItems;
  const subtotal = isBuyNow && buyNowItem
    ? ((buyNowItem.product.is_on_sale && buyNowItem.product.sale_price ? buyNowItem.product.sale_price : buyNowItem.product.price) * buyNowItem.quantity)
    : cartSubtotal;
  const total = isBuyNow ? subtotal - (discountAmount || 0) : cartTotal;
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [zipError, setZipError] = useState('');
  const [profile, setProfile] = useState(null);
  const [hideTerms, setHideTerms] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    street: '', barangay: '', city: '', state: '', postal_code: '',
    lat: null, lng: null,
  });

  useEffect(() => {
    const persistedAgreement = localStorage.getItem('checkoutTermsAccepted') === 'true';
    if (persistedAgreement) {
      setAgreeTerms(true);
      setHideTerms(true);
    }

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
        setAddressQuery(def.street || '');
      }
    }).catch(() => {});
  }, []);

  const shippingCost = shippingMethod === 'pickup' ? 0 : shippingMethod === 'express' ? 300 : subtotal >= 2500 ? 0 : 150;
  const grandTotal = total + shippingCost;

  const formatPrice = (p) => `PHP ${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const digitsOnly = (value) => value.replace(/\D/g, '');
  const validateZip = (zip) => /^\d{4}$/.test(zip);

  const handleApplyPromo = async () => {
    setPromoError('');
    try {
      await applyDiscount(promoCode);
    } catch (e) {
      setPromoError(e.message || 'Invalid promo code');
    }
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

    const usingSavedAddress = selectedAddress && !showNewAddress;
    const selectedAddr = addresses.find((a) => a.id === selectedAddress);
    if (!usingSavedAddress && !showNewAddress) {
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
        const coordLabel = !usingSavedAddress && form.lat && form.lng ? ` (lat:${form.lat}, lng:${form.lng})` : '';
        const shippingAddress = selectedAddr
          ? `${selectedAddr.recipient_name}, ${selectedAddr.street}, ${selectedAddr.city}, ${selectedAddr.state} ${selectedAddr.postal_code}, Philippines`
          : `${form.name}, ${streetWithBarangay}, ${form.city}, ${form.state} ${form.postal_code}, Philippines${coordLabel}`;

      const stockError = await validateStockBeforeCheckout();
      if (stockError) {
        setError(stockError);
        setProcessing(false);
        return;
      }

      if (paymentMethod === 'card') {
        await createPaymentIntent(Math.round(grandTotal), items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity
        })), 'php');
      }

      const orderData = {
        user_id: u?.id,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.product.is_on_sale && i.product.sale_price ? i.product.sale_price : i.product.price,
          product_name: i.product?.name,
          product_price: i.product.is_on_sale && i.product.sale_price ? i.product.sale_price : i.product.price
        })),
        shipping_address: shippingAddress,
        shipping_method: shippingMethod,
        total_amount: grandTotal,
        payment_method: paymentMethod,
        guest_info: !u ? { name: form.name, email: form.email } : undefined,
        discount_amount: discountAmount,
        promo_code_used: discount?.code,
      };

      const order = await createOrder(orderData);
      if (!isBuyNow) await clearCart();
      navigate(`/order-confirmation/${order.id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Your cart is empty</h2>
          <Link to="/shop" className="text-orange-500 hover:text-orange-600 text-sm font-medium">Continue Shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-orange-500">Home</Link>
          <ChevronRight size={14} />
          <Link to="/cart" className="hover:text-orange-500">Cart</Link>
          <ChevronRight size={14} />
          <span className="text-gray-900 font-medium">Checkout</span>
        </div>

        <h1 className="font-display font-bold text-2xl text-gray-900 mb-8">Checkout</h1>

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
                      <label key={addr.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${selectedAddress === addr.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
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
                            setAddressQuery(addr.street || '');
                          }}
                          className="mt-1 text-orange-500 focus:ring-orange-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{addr.recipient_name} {addr.is_default && <span className="text-xs text-orange-500 ml-1">Default</span>}</p>
                          <p className="text-sm text-gray-500">{addr.street}, {addr.city}, {addr.state} {addr.postal_code}</p>
                          {addr.phone && <p className="text-sm text-gray-500">{addr.phone}</p>}
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
                        setAddressQuery('');
                      }}
                      className="text-sm text-orange-500 hover:text-orange-600 font-medium"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Search Address</label>
                      <AddressAutocomplete
                        value={addressQuery}
                        onInputChange={(val) => setAddressQuery(val)}
                        onSelect={(selected) => {
                          setAddressQuery(selected.street || '');
                          setForm((f) => ({
                            ...f,
                            street: selected.street || f.street,
                            barangay: selected.barangay || f.barangay,
                            city: selected.city || f.city,
                            state: selected.state || f.state,
                            postal_code: selected.postal_code || f.postal_code,
                            lat: null,
                            lng: null,
                          }));
                          setZipError(selected.postal_code ? '' : zipError);
                        }}
                      />
                    </div>
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
                    <Input label="Street / House No." value={form.street} onChange={(v) => setForm((f) => ({ ...f, street: v, lat: null, lng: null }))} required={!selectedAddress} className="md:col-span-2" />
                    {form.state && form.city && form.barangay && (
                      <div className="md:col-span-2">
                        <MapPinPicker
                          street={form.street}
                          barangay={form.barangay}
                          city={form.city}
                          state={form.state}
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
                    { id: 'standard', label: 'Standard Shipping', desc: '3-5 business days', price: subtotal >= 2500 ? 'Free' : 'PHP 150.00' },
                    { id: 'express', label: 'Express Shipping', desc: '1-2 business days', price: 'PHP 300.00' },
                    { id: 'pickup', label: 'Store Pickup', desc: 'Pick up at our store', price: 'Free' },
                  ].map((method) => (
                    <label key={method.id} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${shippingMethod === method.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" name="shipping" checked={shippingMethod === method.id} onChange={() => setShippingMethod(method.id)} className="text-orange-500 focus:ring-orange-500" />
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
                    <label key={method.id} className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${paymentMethod === method.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="payment" checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} className="text-orange-500 focus:ring-orange-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{method.label}</p>
                        <p className="text-xs text-gray-500">{method.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {paymentMethod === 'card' && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} className="text-green-600" />
                      <p className="text-sm font-medium text-gray-700">Secure Card Payment via Stripe</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Your card details are collected and processed securely by Stripe. Card numbers never touch our servers - fully PCI-DSS compliant.
                    </p>
                    <div className="bg-white border border-gray-300 rounded-lg p-4 text-center text-sm text-gray-400" id="stripe-card-element">
                      <CreditCard size={24} className="mx-auto mb-2 text-gray-300" />
                      Stripe Card Element loads here
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 text-center">Protected by Stripe - 256-bit SSL encryption</p>
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
              <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
                <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">Order Summary</h2>

                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.productId} className="flex gap-3">
                      <div className="w-14 h-14 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={item.product.image || 'https://via.placeholder.com/56'} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 line-clamp-1">{item.product.name}</p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatPrice((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Promo code"
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <button type="button" onClick={handleApplyPromo} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors">Apply</button>
                  </div>
                  {promoError && <p className="text-xs text-orange-500 mt-1">{promoError}</p>}
                  {discount && (
                    <div className="flex items-center justify-between mt-2 p-2 bg-green-50 rounded-lg">
                      <span className="text-xs text-green-700 font-medium">{discount.code} applied!</span>
                      <button type="button" onClick={removeDiscount} className="text-xs text-green-600 hover:text-green-800"><X size={14} /></button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                  {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(discountAmount)}</span></div>}
                  <div className="flex justify-between text-gray-600"><span>Shipping</span><span className={shippingCost === 0 ? 'text-green-600 font-medium' : ''}>{shippingCost === 0 ? 'Free' : formatPrice(shippingCost)}</span></div>
                  <div className="flex justify-between text-gray-500 text-xs"><span>VAT (12% included)</span><span>{formatPrice((grandTotal / 1.12) * 0.12)}</span></div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-xl text-gray-900">{formatPrice(grandTotal)}</span></div>
                </div>

                {!hideTerms && (
                  <label className={`flex items-start gap-2 mt-4 ${agreeTerms ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAgreeTerms(checked);
                        if (checked) {
                          localStorage.setItem('checkoutTermsAccepted', 'true');
                          setHideTerms(true);
                        }
                      }}
                      className="mt-0.5 text-orange-500 focus:ring-orange-500 rounded"
                    />
                    <span className="text-xs text-gray-500">I agree to the <Link to="/terms" className="text-orange-500 hover:underline">Terms & Conditions</Link> and <Link to="/privacy" className="text-orange-500 hover:underline">Privacy Policy</Link></span>
                  </label>
                )}

                {error && <p className="text-sm text-orange-500 mt-3">{error}</p>}

                <button
                  type="submit"
                  disabled={processing || !agreeTerms}
                  className="w-full mt-4 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
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
  <div className="bg-white rounded-xl border border-gray-100 p-6">
    <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">{icon} {title}</h2>
    {children}
  </div>
);

const Input = ({ label, value, onChange, type = 'text', required, placeholder, className = '', inputMode, pattern, error }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-orange-500">*</span>}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      inputMode={inputMode}
      pattern={pattern}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${error ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-orange-500'}`}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

export default Checkout;
