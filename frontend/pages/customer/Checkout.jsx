import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, CreditCard, MapPin, Truck, Tag, X, Shield, Check } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getAddresses, createOrder, createPaymentIntent } from '../../services/api';

const Checkout = () => {
  const { items, subtotal, total, discount, discountAmount, applyDiscount, removeDiscount, clearCart } = useCart();
  const navigate = useNavigate();
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

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    street: '', city: '', state: '', postal_code: '',
    cardName: '', cardNumber: '', cardExpiry: '', cardCvv: '',
  });

  useEffect(() => {
    const user = localStorage.getItem('shopCoreUser');
    if (!user) {
      // Guest Checkout is allowed
      return;
    }
    const u = JSON.parse(user);
    setForm(f => ({ ...f, name: u.name || '', email: u.email || '' }));
    getAddresses(u.id).then(addrs => {
      setAddresses(addrs);
      const def = addrs.find(a => a.is_default);
      if (def) setSelectedAddress(def.id);
    }).catch(() => { });
  }, [navigate]);

  const shippingCost = shippingMethod === 'pickup' ? 0 : shippingMethod === 'express' ? 300 : subtotal >= 2500 ? 0 : 150;
  const grandTotal = total + shippingCost;

  const formatPrice = (p) => `₱${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const handleApplyPromo = async () => {
    setPromoError('');
    try { await applyDiscount(promoCode); } catch (e) { setPromoError(e.message || 'Invalid promo code'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreeTerms) { setError('Please agree to the terms and conditions'); return; }
    setProcessing(true);
    setError('');

    try {
      const user = localStorage.getItem('shopCoreUser');
      const u = user ? JSON.parse(user) : null;

      const selectedAddr = addresses.find(a => a.id === selectedAddress);
      const shippingAddress = selectedAddr
        ? `${selectedAddr.recipient_name}, ${selectedAddr.street}, ${selectedAddr.city}, ${selectedAddr.state} ${selectedAddr.postal_code}`
        : `${form.name}, ${form.street}, ${form.city}, ${form.state} ${form.postal_code}`;

      if (paymentMethod === 'card') {
        const piData = await createPaymentIntent(Math.round(grandTotal * 100), items.map(i => ({
          product_id: i.productId,
          quantity: i.quantity
        })), 'php');
        // In a professional integration, we would confirm the payment with Stripe Elements here.
      }

      const orderData = {
        user_id: u?.id,
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.product.is_on_sale && i.product.sale_price ? i.product.sale_price : i.product.price
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
      await clearCart();
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
        {/* Breadcrumb */}
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
            {/* Left column */}
            <div className="flex-1 space-y-6">
              {/* Contact */}
              <Section title="Contact Information" icon={<MapPin size={18} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Full Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                  <Input label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} required />
                  <Input label="Phone" type="tel" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} className="md:col-span-2" />
                </div>
              </Section>

              {/* Shipping Address */}
              <Section title="Shipping Address" icon={<MapPin size={18} />}>
                {addresses.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {addresses.map(addr => (
                      <label key={addr.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${selectedAddress === addr.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="address" checked={selectedAddress === addr.id} onChange={() => { setSelectedAddress(addr.id); setShowNewAddress(false); }} className="mt-1 text-orange-500 focus:ring-orange-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{addr.recipient_name} {addr.is_default && <span className="text-xs text-orange-500 ml-1">Default</span>}</p>
                          <p className="text-sm text-gray-500">{addr.street}, {addr.city}, {addr.state} {addr.postal_code}</p>
                          {addr.phone && <p className="text-sm text-gray-500">{addr.phone}</p>}
                        </div>
                      </label>
                    ))}
                    <button type="button" onClick={() => { setSelectedAddress(null); setShowNewAddress(true); }} className="text-sm text-orange-500 hover:text-orange-600 font-medium">
                      + Use a different address
                    </button>
                  </div>
                )}
                {(addresses.length === 0 || showNewAddress) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Street Address" value={form.street} onChange={v => setForm(f => ({ ...f, street: v }))} required={!selectedAddress} className="md:col-span-2" />
                    <Input label="City" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} required={!selectedAddress} />
                    <Input label="State/Province" value={form.state} onChange={v => setForm(f => ({ ...f, state: v }))} required={!selectedAddress} />
                    <Input label="Postal Code" value={form.postal_code} onChange={v => setForm(f => ({ ...f, postal_code: v }))} required={!selectedAddress} />
                  </div>
                )}
              </Section>

              {/* Shipping Method */}
              <Section title="Shipping Method" icon={<Truck size={18} />}>
                <div className="space-y-2">
                  {[
                    { id: 'standard', label: 'Standard Shipping', desc: '3-5 business days', price: subtotal >= 2500 ? 'Free' : '₱150.00' },
                    { id: 'express', label: 'Express Shipping', desc: '1-2 business days', price: '₱300.00' },
                    { id: 'pickup', label: 'Store Pickup', desc: 'Pick up at our store', price: 'Free' },
                  ].map(method => (
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

              {/* Payment */}
              <Section title="Payment Method" icon={<CreditCard size={18} />}>
                <div className="space-y-2 mb-4">
                  {[
                    { id: 'card', label: 'Credit/Debit Card', desc: 'Visa, Mastercard' },
                    { id: 'gcash', label: 'GCash', desc: 'Pay via GCash e-wallet' },
                    { id: 'bank_transfer', label: 'Bank Transfer', desc: 'BDO, BPI, UnionBank, etc.' },
                    { id: 'cod', label: 'Cash on Delivery', desc: 'Pay when you receive' },
                  ].map(method => (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                    <Input label="Name on Card" value={form.cardName} onChange={v => setForm(f => ({ ...f, cardName: v }))} className="md:col-span-2" />
                    <Input label="Card Number" value={form.cardNumber} onChange={v => setForm(f => ({ ...f, cardNumber: v }))} placeholder="4242 4242 4242 4242" className="md:col-span-2" />
                    <Input label="Expiry" value={form.cardExpiry} onChange={v => setForm(f => ({ ...f, cardExpiry: v }))} placeholder="MM/YY" />
                    <Input label="CVV" value={form.cardCvv} onChange={v => setForm(f => ({ ...f, cardCvv: v }))} placeholder="123" />
                  </div>
                )}
                {paymentMethod === 'gcash' && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-sm font-medium text-blue-700 mb-2">GCash Payment</p>
                    <p className="text-xs text-blue-600 mb-3">You will receive payment instructions after placing your order. Please send payment to our GCash number and upload your proof of payment.</p>
                    <Input label="GCash Number" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="09XX XXX XXXX" />
                  </div>
                )}
                {paymentMethod === 'bank_transfer' && (
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-sm font-medium text-green-700 mb-2">Bank Transfer</p>
                    <p className="text-xs text-green-600 mb-3">After placing your order, transfer the total amount to one of our bank accounts. Your order will be processed once payment is confirmed.</p>
                    <div className="space-y-1 text-xs text-green-700">
                      <p><strong>BDO:</strong> 1234-5678-9012</p>
                      <p><strong>BPI:</strong> 9876-5432-1098</p>
                      <p><strong>UnionBank:</strong> 1111-2222-3333</p>
                    </div>
                  </div>
                )}
              </Section>
            </div>

            {/* Order Summary */}
            <div className="lg:w-96">
              <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
                <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">Order Summary</h2>

                {/* Items */}
                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {items.map(item => (
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

                {/* Promo Code */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={promoCode} onChange={e => setPromoCode(e.target.value)}
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

                {/* Totals */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                  {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(discountAmount)}</span></div>}
                  <div className="flex justify-between text-gray-600"><span>Shipping</span><span className={shippingCost === 0 ? 'text-green-600 font-medium' : ''}>{shippingCost === 0 ? 'Free' : formatPrice(shippingCost)}</span></div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-xl text-gray-900">{formatPrice(grandTotal)}</span></div>
                </div>

                {/* Terms */}
                <label className="flex items-start gap-2 mt-4 cursor-pointer">
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-0.5 text-orange-500 focus:ring-orange-500 rounded" />
                  <span className="text-xs text-gray-500">I agree to the <a href="#" className="text-orange-500 hover:underline">Terms & Conditions</a> and <a href="#" className="text-orange-500 hover:underline">Privacy Policy</a></span>
                </label>

                {error && <p className="text-sm text-orange-500 mt-3">{error}</p>}

                <button
                  type="submit"
                  disabled={processing || !agreeTerms}
                  className="w-full mt-4 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</span>
                  ) : (
                    <span className="flex items-center gap-2"><Shield size={16} /> Place Order — {formatPrice(grandTotal)}</span>
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

const Input = ({ label, value, onChange, type = 'text', required, placeholder, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-orange-500">*</span>}</label>
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
    />
  </div>
);

export default Checkout;
