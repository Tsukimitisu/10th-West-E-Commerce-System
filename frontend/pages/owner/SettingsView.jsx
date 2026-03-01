import React, { useState, useEffect } from 'react';
import { Settings, Store, CreditCard, Truck, Mail, Receipt, Globe, Save, Bell, Loader2 } from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '../../services/api';

const SettingsView = () => {
  const [tab, setTab] = useState('store');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [store, setStore] = useState({
    name: '10th West Moto', tagline: '',
    email: '', phone: '',
    address: '', currency: 'PHP', timezone: 'Asia/Manila',
    logoUrl: '',
  });

  const [tax, setTax] = useState({
    enabled: true, rate: '12', name: 'VAT', inclusive: true,
  });

  const [shipping, setShipping] = useState({
    freeThreshold: '3000', flatRate: '150', expressRate: '350',
    enablePickup: true,
  });

  const [payment, setPayment] = useState({
    cash: true, card: true, gcash: false, maya: false,
    stripePk: '', stripeSk: '',
  });

  const [email, setEmail] = useState({
    orderConfirmation: true, shippingUpdate: true, returnApproval: true,
    promotions: false, fromName: '10th West Moto', fromEmail: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const allSettings = await getSystemSettings();
        const parsed = { store: {}, tax: {}, shipping: {}, payment: {}, email: {} };
        (Array.isArray(allSettings) ? allSettings : []).forEach(s => {
          if (parsed[s.category]) parsed[s.category][s.key] = s.value;
        });
        setStore({
          name: parsed.store.name || '10th West Moto',
          tagline: parsed.store.tagline || '',
          email: parsed.store.email || '',
          phone: parsed.store.phone || '',
          address: parsed.store.address || '',
          currency: parsed.store.currency || 'PHP',
          timezone: parsed.store.timezone || 'Asia/Manila',
          logoUrl: parsed.store.logo_url || '',
        });
        setTax({
          enabled: parsed.tax.enabled !== 'false',
          name: parsed.tax.name || 'VAT',
          rate: parsed.tax.rate || '12',
          inclusive: parsed.tax.inclusive !== 'false',
        });
        setShipping({
          flatRate: parsed.shipping.flat_rate || '150',
          freeThreshold: parsed.shipping.free_threshold || '3000',
          expressRate: parsed.shipping.express_rate || '350',
          enablePickup: parsed.shipping.enable_pickup !== 'false',
        });
        setPayment({
          cash: parsed.payment.cash_enabled !== 'false',
          card: parsed.payment.card_enabled !== 'false',
          gcash: parsed.payment.gcash_enabled === 'true',
          maya: parsed.payment.maya_enabled === 'true',
          stripePk: parsed.payment.stripe_pk || '',
          stripeSk: parsed.payment.stripe_sk || '',
        });
        setEmail({
          fromName: parsed.email.from_name || '10th West Moto',
          fromEmail: parsed.email.from_email || '',
          orderConfirmation: parsed.email.order_confirmation !== 'false',
          shippingUpdate: parsed.email.shipping_update !== 'false',
          returnApproval: parsed.email.return_approval !== 'false',
          promotions: parsed.email.promotions === 'true',
        });
      } catch (err) { console.error('Failed to load settings:', err); }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      let settingsMap = {};
      switch (tab) {
        case 'store':
          settingsMap = { name: store.name, tagline: store.tagline, email: store.email, phone: store.phone, address: store.address, currency: store.currency, timezone: store.timezone, logo_url: store.logoUrl };
          break;
        case 'tax':
          settingsMap = { enabled: String(tax.enabled), name: tax.name, rate: tax.rate, inclusive: String(tax.inclusive) };
          break;
        case 'shipping':
          settingsMap = { flat_rate: shipping.flatRate, free_threshold: shipping.freeThreshold, express_rate: shipping.expressRate, enable_pickup: String(shipping.enablePickup) };
          break;
        case 'payment':
          settingsMap = { cash_enabled: String(payment.cash), card_enabled: String(payment.card), gcash_enabled: String(payment.gcash), maya_enabled: String(payment.maya), stripe_pk: payment.stripePk, stripe_sk: payment.stripeSk };
          break;
        case 'email':
          settingsMap = { from_name: email.fromName, from_email: email.fromEmail, order_confirmation: String(email.orderConfirmation), shipping_update: String(email.shippingUpdate), return_approval: String(email.returnApproval), promotions: String(email.promotions) };
          break;
      }
      await updateSystemSettings(tab, settingsMap);
      setSaveError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError('Failed to save settings');
      setTimeout(() => setSaveError(''), 4000);
    }
    setSaving(false);
  };

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300";
  const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>;

  const tabs = [
    { id: 'store', label: 'Store', icon: Store },
    { id: 'tax', label: 'Tax', icon: Receipt },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'email', label: 'Email', icon: Mail },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500 mr-2" />
        <span className="text-sm text-gray-500">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-500">Configure store preferences and integrations</p>
        </div>
        <button onClick={handleSave} disabled={saving} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 ${saved ? 'bg-green-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? <><Save size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
          <span>⚠</span> {saveError}
        </div>
      )}

      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-orange-50 text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {/* Store Settings */}
        {tab === 'store' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Store Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Store Name</Label><input value={store.name} onChange={e => setStore(s => ({...s, name: e.target.value}))} className={inputClass} /></div>
              <div><Label>Tagline</Label><input value={store.tagline} onChange={e => setStore(s => ({...s, tagline: e.target.value}))} className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Contact Email</Label><input type="email" value={store.email} onChange={e => setStore(s => ({...s, email: e.target.value}))} className={inputClass} /></div>
              <div><Label>Phone</Label><input value={store.phone} onChange={e => setStore(s => ({...s, phone: e.target.value}))} className={inputClass} /></div>
            </div>
            <div><Label>Address</Label><input value={store.address} onChange={e => setStore(s => ({...s, address: e.target.value}))} className={inputClass} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Currency</Label>
                <select value={store.currency} onChange={e => setStore(s => ({...s, currency: e.target.value}))} className={inputClass}>
                  <option value="PHP">PHP (P)</option><option value="USD">USD ($)</option>
                </select>
              </div>
              <div><Label>Timezone</Label>
                <select value={store.timezone} onChange={e => setStore(s => ({...s, timezone: e.target.value}))} className={inputClass}>
                  <option value="Asia/Manila">Asia/Manila (GMT+8)</option><option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div><Label>Logo URL</Label><input value={store.logoUrl} onChange={e => setStore(s => ({...s, logoUrl: e.target.value}))} className={inputClass} placeholder="https://..." /></div>
          </div>
        )}

        {/* Tax */}
        {tab === 'tax' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Tax Configuration</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={tax.enabled} onChange={e => setTax(t => ({...t, enabled: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500" />
              Enable Tax Collection
            </label>
            {tax.enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-orange-100">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Tax Name</Label><input value={tax.name} onChange={e => setTax(t => ({...t, name: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Tax Rate (%)</Label><input type="number" step="0.1" value={tax.rate} onChange={e => setTax(t => ({...t, rate: e.target.value}))} className={inputClass} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={tax.inclusive} onChange={e => setTax(t => ({...t, inclusive: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded" />
                  Tax included in product prices
                </label>
              </div>
            )}
          </div>
        )}

        {/* Shipping */}
        {tab === 'shipping' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Shipping Methods</h3>
            <div className="space-y-3">
              <div className="p-4 border border-gray-100 rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-gray-900">Standard Shipping</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Flat Rate (P)</Label><input type="number" value={shipping.flatRate} onChange={e => setShipping(s => ({...s, flatRate: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Free Shipping Threshold (P)</Label><input type="number" value={shipping.freeThreshold} onChange={e => setShipping(s => ({...s, freeThreshold: e.target.value}))} className={inputClass} /></div>
                </div>
              </div>
              <div className="p-4 border border-gray-100 rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-gray-900">Express Shipping</h4>
                <div><Label>Express Rate (P)</Label><input type="number" value={shipping.expressRate} onChange={e => setShipping(s => ({...s, expressRate: e.target.value}))} className={inputClass} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer p-3 border border-gray-100 rounded-lg">
                <input type="checkbox" checked={shipping.enablePickup} onChange={e => setShipping(s => ({...s, enablePickup: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded" />
                Enable In-Store Pickup
              </label>
            </div>
          </div>
        )}

        {/* Payment */}
        {tab === 'payment' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Payment Methods</h3>
            <div className="space-y-2">
              {[
                { key: 'cash', label: 'Cash on Delivery / POS Cash' },
                { key: 'card', label: 'Credit/Debit Card (Stripe)' },
                { key: 'gcash', label: 'GCash' },
                { key: 'maya', label: 'Maya' },
              ].map(m => (
                <label key={m.key} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${payment[m.key] ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'}`}>
                  <span className="text-sm font-medium text-gray-900">{m.label}</span>
                  <input type="checkbox" checked={payment[m.key]} onChange={e => setPayment(p => ({...p, [m.key]: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded" />
                </label>
              ))}
            </div>
            {payment.card && (
              <div className="space-y-3 p-4 border border-gray-100 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900">Stripe Configuration</h4>
                <div><Label>Publishable Key</Label><input type="password" value={payment.stripePk} onChange={e => setPayment(p => ({...p, stripePk: e.target.value}))} className={inputClass} placeholder="pk_..." /></div>
                <div><Label>Secret Key</Label><input type="password" value={payment.stripeSk} onChange={e => setPayment(p => ({...p, stripeSk: e.target.value}))} className={inputClass} placeholder="sk_..." /></div>
              </div>
            )}
          </div>
        )}

        {/* Email */}
        {tab === 'email' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Email Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>From Name</Label><input value={email.fromName} onChange={e => setEmail(em => ({...em, fromName: e.target.value}))} className={inputClass} /></div>
              <div><Label>From Email</Label><input type="email" value={email.fromEmail} onChange={e => setEmail(em => ({...em, fromEmail: e.target.value}))} className={inputClass} /></div>
            </div>
            <h4 className="text-sm font-medium text-gray-900 pt-2">Email Notifications</h4>
            <div className="space-y-2">
              {[
                { key: 'orderConfirmation', label: 'Order Confirmation', desc: 'Send email when a new order is placed' },
                { key: 'shippingUpdate', label: 'Shipping Updates', desc: 'Notify when order status changes' },
                { key: 'returnApproval', label: 'Return Approval', desc: 'Notify when return request is updated' },
                { key: 'promotions', label: 'Promotional Emails', desc: 'Send marketing and promotion emails' },
              ].map(n => (
                <label key={n.key} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${email[n.key] ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'}`}>
                  <div><p className="text-sm font-medium text-gray-900">{n.label}</p><p className="text-[10px] text-gray-500">{n.desc}</p></div>
                  <input type="checkbox" checked={email[n.key]} onChange={e => setEmail(em => ({...em, [n.key]: e.target.checked}))} className="w-4 h-4 text-green-600 rounded" />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsView;
