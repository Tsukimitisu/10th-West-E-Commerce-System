import React, { useState, useEffect } from 'react';
import { Settings, Store, CreditCard, Truck, Mail, Receipt, Globe, Save, Bell, Loader2, RotateCcw } from 'lucide-react';
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

  const [returnsConfig, setReturnsConfig] = useState({
    returnWindowDays: '15',
  });

  const [home, setHome] = useState({
    heroAutoplay: true,
    heroIntervalMs: '5000',
    heroShowDots: true,
    heroShowArrows: true,
    heroPauseOnHover: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const allSettings = await getSystemSettings();
        const parsed = { store: {}, tax: {}, shipping: {}, payment: {}, email: {}, returns: {}, home: {} };
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
        setReturnsConfig({
          returnWindowDays: parsed.returns.return_window_days || '15',
        });
        setHome({
          heroAutoplay: parsed.home.hero_autoplay !== 'false',
          heroIntervalMs: parsed.home.hero_interval_ms || '5000',
          heroShowDots: parsed.home.hero_show_dots !== 'false',
          heroShowArrows: parsed.home.hero_show_arrows !== 'false',
          heroPauseOnHover: parsed.home.hero_pause_on_hover !== 'false',
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
        case 'returns':
          settingsMap = { return_window_days: returnsConfig.returnWindowDays };
          break;
        case 'home':
          settingsMap = {
            hero_autoplay: String(home.heroAutoplay),
            hero_interval_ms: home.heroIntervalMs,
            hero_show_dots: String(home.heroShowDots),
            hero_show_arrows: String(home.heroShowArrows),
            hero_pause_on_hover: String(home.heroPauseOnHover),
          };
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

  const inputClass = "w-full px-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300";
  const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>;

  const tabs = [
    { id: 'store', label: 'Store', icon: Store },
    { id: 'home', label: 'Home', icon: Globe },
    { id: 'tax', label: 'Tax', icon: Receipt },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'returns', label: 'Returns', icon: RotateCcw },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-red-500 mr-2" />
        <span className="text-sm text-gray-400">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-white">System Settings</h1>
          <p className="text-sm text-gray-400">Configure store preferences and integrations</p>
        </div>
        <button onClick={handleSave} disabled={saving} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 ${saved ? 'bg-green-600 text-white' : 'bg-red-500/100 hover:bg-red-600 text-white'}`}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? <><Save size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
          <span>âš </span> {saveError}
        </div>
      )}

      <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        {/* Store Settings */}
        {tab === 'store' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Store Information</h3>
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

        {tab === 'returns' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Return Settings</h3>
            <div>
              <Label>Return Period (days)</Label>
              <input
                type="number"
                min="1"
                max="365"
                value={returnsConfig.returnWindowDays}
                onChange={(e) => setReturnsConfig((prev) => ({ ...prev, returnWindowDays: e.target.value }))}
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-2">Delivered orders can request a return within this window.</p>
            </div>
          </div>
        )}

        {/* Home */}
        {tab === 'home' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Home Hero Carousel</h3>
            <p className="text-sm text-gray-400">
              These settings affect the hero section on the Home page only.
            </p>

            <label className="flex items-center justify-between p-3 border border-gray-700 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Auto-rotate slides</p>
                <p className="text-[10px] text-gray-400">Automatically move to the next hero slide.</p>
              </div>
              <input
                type="checkbox"
                checked={home.heroAutoplay}
                onChange={e => setHome(h => ({ ...h, heroAutoplay: e.target.checked }))}
                className="w-4 h-4 text-red-500 rounded"
              />
            </label>

            <div>
              <Label>Slide Interval (milliseconds)</Label>
              <input
                type="number"
                min="2000"
                step="500"
                value={home.heroIntervalMs}
                onChange={e => setHome(h => ({ ...h, heroIntervalMs: e.target.value }))}
                className={inputClass}
              />
              <p className="text-[10px] text-gray-400 mt-1">Recommended: 4000-7000ms for readability.</p>
            </div>

            <label className="flex items-center justify-between p-3 border border-gray-700 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Show navigation dots</p>
                <p className="text-[10px] text-gray-400">Displays slide indicators below the hero.</p>
              </div>
              <input
                type="checkbox"
                checked={home.heroShowDots}
                onChange={e => setHome(h => ({ ...h, heroShowDots: e.target.checked }))}
                className="w-4 h-4 text-red-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-gray-700 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Show left and right arrows</p>
                <p className="text-[10px] text-gray-400">Lets users manually switch slides.</p>
              </div>
              <input
                type="checkbox"
                checked={home.heroShowArrows}
                onChange={e => setHome(h => ({ ...h, heroShowArrows: e.target.checked }))}
                className="w-4 h-4 text-red-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-gray-700 rounded-lg cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Pause on hover</p>
                <p className="text-[10px] text-gray-400">Stops auto-rotation while reading desktop hero text.</p>
              </div>
              <input
                type="checkbox"
                checked={home.heroPauseOnHover}
                onChange={e => setHome(h => ({ ...h, heroPauseOnHover: e.target.checked }))}
                className="w-4 h-4 text-red-500 rounded"
              />
            </label>
          </div>
        )}

        {/* Tax */}
        {tab === 'tax' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Tax Configuration</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={tax.enabled} onChange={e => setTax(t => ({...t, enabled: e.target.checked}))} className="w-4 h-4 text-red-500 rounded focus:ring-orange-500" />
              Enable Tax Collection
            </label>
            {tax.enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-red-100">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Tax Name</Label><input value={tax.name} onChange={e => setTax(t => ({...t, name: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Tax Rate (%)</Label><input type="number" step="0.1" value={tax.rate} onChange={e => setTax(t => ({...t, rate: e.target.value}))} className={inputClass} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={tax.inclusive} onChange={e => setTax(t => ({...t, inclusive: e.target.checked}))} className="w-4 h-4 text-red-500 rounded" />
                  Tax included in product prices
                </label>
              </div>
            )}
          </div>
        )}

        {/* Shipping */}
        {tab === 'shipping' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Shipping Methods</h3>
            <div className="space-y-3">
              <div className="p-4 border border-gray-700 rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-white">Standard Shipping</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Flat Rate (P)</Label><input type="number" value={shipping.flatRate} onChange={e => setShipping(s => ({...s, flatRate: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Free Shipping Threshold (P)</Label><input type="number" value={shipping.freeThreshold} onChange={e => setShipping(s => ({...s, freeThreshold: e.target.value}))} className={inputClass} /></div>
                </div>
              </div>
              <div className="p-4 border border-gray-700 rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-white">Express Shipping</h4>
                <div><Label>Express Rate (P)</Label><input type="number" value={shipping.expressRate} onChange={e => setShipping(s => ({...s, expressRate: e.target.value}))} className={inputClass} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer p-3 border border-gray-700 rounded-lg">
                <input type="checkbox" checked={shipping.enablePickup} onChange={e => setShipping(s => ({...s, enablePickup: e.target.checked}))} className="w-4 h-4 text-red-500 rounded" />
                Enable In-Store Pickup
              </label>
            </div>
          </div>
        )}

        {/* Payment */}
        {tab === 'payment' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Payment Methods</h3>
            <div className="space-y-2">
              {[
                { key: 'cash', label: 'Cash on Delivery / POS Cash' },
                { key: 'card', label: 'Credit/Debit Card (Stripe)' },
                { key: 'gcash', label: 'GCash' },
                { key: 'maya', label: 'Maya' },
              ].map(m => (
                <label key={m.key} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${payment[m.key] ? 'border-red-200 bg-red-500/10' : 'border-gray-700 bg-gray-800'}`}>
                  <span className="text-sm font-medium text-white">{m.label}</span>
                  <input type="checkbox" checked={payment[m.key]} onChange={e => setPayment(p => ({...p, [m.key]: e.target.checked}))} className="w-4 h-4 text-red-500 rounded" />
                </label>
              ))}
            </div>
            {payment.card && (
              <div className="space-y-3 p-4 border border-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-white">Stripe Configuration</h4>
                <div><Label>Publishable Key</Label><input type="password" value={payment.stripePk} onChange={e => setPayment(p => ({...p, stripePk: e.target.value}))} className={inputClass} placeholder="pk_..." /></div>
                <div><Label>Secret Key</Label><input type="password" value={payment.stripeSk} onChange={e => setPayment(p => ({...p, stripeSk: e.target.value}))} className={inputClass} placeholder="sk_..." /></div>
              </div>
            )}
          </div>
        )}

        {/* Email */}
        {tab === 'email' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-white">Email Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>From Name</Label><input value={email.fromName} onChange={e => setEmail(em => ({...em, fromName: e.target.value}))} className={inputClass} /></div>
              <div><Label>From Email</Label><input type="email" value={email.fromEmail} onChange={e => setEmail(em => ({...em, fromEmail: e.target.value}))} className={inputClass} /></div>
            </div>
            <h4 className="text-sm font-medium text-white pt-2">Email Notifications</h4>
            <div className="space-y-2">
              {[
                { key: 'orderConfirmation', label: 'Order Confirmation', desc: 'Send email when a new order is placed' },
                { key: 'shippingUpdate', label: 'Shipping Updates', desc: 'Notify when order status changes' },
                { key: 'returnApproval', label: 'Return Approval', desc: 'Notify when return request is updated' },
                { key: 'promotions', label: 'Promotional Emails', desc: 'Send marketing and promotion emails' },
              ].map(n => (
                <label key={n.key} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${email[n.key] ? 'border-green-200 bg-green-50' : 'border-gray-700 bg-gray-800'}`}>
                  <div><p className="text-sm font-medium text-white">{n.label}</p><p className="text-[10px] text-gray-400">{n.desc}</p></div>
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


