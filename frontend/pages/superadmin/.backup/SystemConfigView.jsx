import React, { useState, useEffect } from 'react';
import {
  Settings, Store, CreditCard, Truck, Mail, Globe,
  Save, Loader2, CheckCircle2, DollarSign, Percent, Clock, Package
} from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '../../services/api';

const SystemConfigView = () => {
  const [tab, setTab] = useState('store');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [store, setStore] = useState({
    name: '10th West Moto', tagline: '', email: '', phone: '',
    address: '', currency: 'PHP', timezone: 'Asia/Manila', logo_url: '',
  });

  const [tax, setTax] = useState({
    enabled: 'true', rate: '12', name: 'VAT', inclusive: 'true',
  });

  const [shipping, setShipping] = useState({
    free_threshold: '3000', flat_rate: '150', express_rate: '350', enable_pickup: 'true',
  });

  const [payment, setPayment] = useState({
    cash_enabled: 'true', card_enabled: 'true', gcash_enabled: 'false', maya_enabled: 'false',
    stripe_pk: '', stripe_sk: '',
  });

  const [email, setEmail] = useState({
    order_confirmation: 'true', shipping_update: 'true', return_approval: 'true',
    promotions: 'false', from_name: '10th West Moto', from_email: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const allSettings = await getSystemSettings();
        const parsed = { store: {}, tax: {}, shipping: {}, payment: {}, email: {} };
        (Array.isArray(allSettings) ? allSettings : []).forEach(s => {
          if (parsed[s.category]) parsed[s.category][s.key] = s.value;
        });
        if (Object.keys(parsed.store).length) setStore(prev => ({ ...prev, ...parsed.store }));
        if (Object.keys(parsed.tax).length) setTax(prev => ({ ...prev, ...parsed.tax }));
        if (Object.keys(parsed.shipping).length) setShipping(prev => ({ ...prev, ...parsed.shipping }));
        if (Object.keys(parsed.payment).length) setPayment(prev => ({ ...prev, ...parsed.payment }));
        if (Object.keys(parsed.email).length) setEmail(prev => ({ ...prev, ...parsed.email }));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const map = { store, tax, shipping, payment, email };
      await updateSystemSettings(tab, map[tab]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const tabs = [
    { id: 'store', label: 'Store Info', icon: Store },
    { id: 'tax', label: 'Tax Rates', icon: Percent },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'payment', label: 'Payment Gateways', icon: CreditCard },
    { id: 'email', label: 'Email Services', icon: Mail },
  ];

  const Toggle = ({ value, onChange, label }) => (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className={`w-10 h-5 rounded-full transition-colors relative ${value === 'true' ? 'bg-red-600' : 'bg-gray-700'}`}
        onClick={onChange}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${value === 'true' ? 'left-5' : 'left-0.5'}`} />
      </div>
      <span className="text-sm text-gray-300 group-hover:text-white">{label}</span>
    </label>
  );

  const Input = ({ label, value, onChange, placeholder, type = 'text', hint }) => (
    <div>
      <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50" />
      {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-400 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Settings size={22} className="text-red-400" /> System Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Configure tax rates, currency, payment gateways, and email services</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-white hover:bg-gray-800'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Store Info */}
      {tab === 'store' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Store size={16} className="text-gray-500" /> Store Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input label="Store Name" value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} placeholder="10th West Moto" />
            <Input label="Tagline" value={store.tagline} onChange={(e) => setStore({ ...store, tagline: e.target.value })} placeholder="Motorcycle Parts & Accessories" />
            <Input label="Store Email" value={store.email} onChange={(e) => setStore({ ...store, email: e.target.value })} placeholder="admin@10thwestmoto.com" type="email" />
            <Input label="Phone" value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} placeholder="+63 XXX XXX XXXX" />
            <div className="md:col-span-2">
              <Input label="Address" value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} placeholder="Manila, Philippines" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Currency</label>
              <select value={store.currency} onChange={(e) => setStore({ ...store, currency: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30">
                <option value="PHP">PHP - Philippine Peso</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Timezone</label>
              <select value={store.timezone} onChange={(e) => setStore({ ...store, timezone: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30">
                <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Input label="Logo URL" value={store.logo_url} onChange={(e) => setStore({ ...store, logo_url: e.target.value })} placeholder="https://..." hint="URL to your store logo" />
            </div>
          </div>
        </div>
      )}

      {/* Tax Rates */}
      {tab === 'tax' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Percent size={16} className="text-gray-500" /> Tax Configuration</h3>
          <div className="space-y-5">
            <Toggle value={tax.enabled} onChange={() => setTax({ ...tax, enabled: tax.enabled === 'true' ? 'false' : 'true' })} label="Enable tax on orders" />
            {tax.enabled === 'true' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pl-2 border-l-2 border-red-600/30">
                <Input label="Tax Name" value={tax.name} onChange={(e) => setTax({ ...tax, name: e.target.value })} placeholder="VAT" />
                <Input label="Tax Rate (%)" value={tax.rate} onChange={(e) => setTax({ ...tax, rate: e.target.value })} placeholder="12" type="number" />
                <div className="flex items-end pb-1">
                  <Toggle value={tax.inclusive} onChange={() => setTax({ ...tax, inclusive: tax.inclusive === 'true' ? 'false' : 'true' })} label="Tax inclusive in price" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shipping */}
      {tab === 'shipping' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Truck size={16} className="text-gray-500" /> Shipping Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input label="Free Shipping Threshold (₱)" value={shipping.free_threshold} onChange={(e) => setShipping({ ...shipping, free_threshold: e.target.value })} placeholder="3000" type="number" hint="Orders above this amount get free shipping" />
            <Input label="Standard Flat Rate (₱)" value={shipping.flat_rate} onChange={(e) => setShipping({ ...shipping, flat_rate: e.target.value })} placeholder="150" type="number" />
            <Input label="Express Rate (₱)" value={shipping.express_rate} onChange={(e) => setShipping({ ...shipping, express_rate: e.target.value })} placeholder="350" type="number" />
            <div className="flex items-end pb-1">
              <Toggle value={shipping.enable_pickup} onChange={() => setShipping({ ...shipping, enable_pickup: shipping.enable_pickup === 'true' ? 'false' : 'true' })} label="Enable store pickup option" />
            </div>
          </div>
        </div>
      )}

      {/* Payment Gateways */}
      {tab === 'payment' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard size={16} className="text-gray-500" /> Payment Methods</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'cash_enabled', label: 'Cash Payment', desc: 'Accept cash for POS and COD' },
              { key: 'card_enabled', label: 'Card Payment', desc: 'Accept credit/debit cards' },
              { key: 'gcash_enabled', label: 'GCash', desc: 'Accept GCash mobile payments' },
              { key: 'maya_enabled', label: 'Maya', desc: 'Accept Maya/PayMaya payments' },
            ].map(pm => (
              <div key={pm.key} className={`p-4 rounded-xl border transition-all ${payment[pm.key] === 'true' ? 'border-red-500/30 bg-red-500/5' : 'border-gray-700 bg-gray-800'}`}>
                <Toggle value={payment[pm.key]} onChange={() => setPayment({ ...payment, [pm.key]: payment[pm.key] === 'true' ? 'false' : 'true' })} label={pm.label} />
                <p className="text-[10px] text-gray-500 mt-1 ml-13">{pm.desc}</p>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-gray-800">
            <h4 className="text-xs font-semibold text-gray-400 mb-4">Stripe Integration</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Stripe Publishable Key" value={payment.stripe_pk} onChange={(e) => setPayment({ ...payment, stripe_pk: e.target.value })} placeholder="pk_live_..." hint="Your Stripe publishable key" />
              <Input label="Stripe Secret Key" value={payment.stripe_sk} onChange={(e) => setPayment({ ...payment, stripe_sk: e.target.value })} placeholder="sk_live_..." hint="Your Stripe secret key (kept server-side)" />
            </div>
          </div>
        </div>
      )}

      {/* Email Services */}
      {tab === 'email' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mail size={16} className="text-gray-500" /> Email Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="From Name" value={email.from_name} onChange={(e) => setEmail({ ...email, from_name: e.target.value })} placeholder="10th West Moto" />
            <Input label="From Email" value={email.from_email} onChange={(e) => setEmail({ ...email, from_email: e.target.value })} placeholder="noreply@10thwestmoto.com" type="email" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-3">Email Notifications</h4>
            <div className="space-y-3">
              {[
                { key: 'order_confirmation', label: 'Order Confirmation', desc: 'Send email when order is placed' },
                { key: 'shipping_update', label: 'Shipping Updates', desc: 'Notify customer on shipment' },
                { key: 'return_approval', label: 'Return Approval', desc: 'Notify on return status change' },
                { key: 'promotions', label: 'Promotional Emails', desc: 'Marketing and promo emails' },
              ].map(em => (
                <div key={em.key} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm text-gray-300">{em.label}</p>
                    <p className="text-[10px] text-gray-600">{em.desc}</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${email[em.key] === 'true' ? 'bg-red-600' : 'bg-gray-700'}`}
                    onClick={() => setEmail({ ...email, [em.key]: email[em.key] === 'true' ? 'false' : 'true' })}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${email[em.key] === 'true' ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemConfigView;
