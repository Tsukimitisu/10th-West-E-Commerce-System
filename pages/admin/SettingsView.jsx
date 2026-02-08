import React, { useState } from 'react';
import { Settings, Store, CreditCard, Truck, Mail, Receipt, Globe, Save, Bell } from 'lucide-react';

const SettingsView = () => {
  const [tab, setTab] = useState('store');
  const [saved, setSaved] = useState(false);

  const [store, setStore] = useState({
    name: '10th West Moto', tagline: 'Motorcycle Parts & Accessories',
    email: 'admin@10thwestmoto.com', phone: '+63 XXX XXX XXXX',
    address: 'Manila, Philippines', currency: 'PHP', timezone: 'Asia/Manila',
    logo: '', favicon: '',
  });

  const [tax, setTax] = useState({
    enabled: true, rate: '12', name: 'VAT', inclusive: true,
  });

  const [shipping, setShipping] = useState({
    freeThreshold: '3000', flatRate: '150', expressRate: '350',
    enablePickup: true, defaultMethod: 'standard',
  });

  const [payment, setPayment] = useState({
    cash: true, card: true, gcash: false, maya: false,
    stripeKey: '', stripeSecret: '',
  });

  const [email, setEmail] = useState({
    orderConfirmation: true, shippingUpdate: true, returnApproval: true,
    promotions: false, fromName: '10th West Moto', fromEmail: 'noreply@10thwestmoto.com',
  });

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300";
  const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>;

  const tabs = [
    { id: 'store', label: 'Store', icon: Store },
    { id: 'tax', label: 'Tax', icon: Receipt },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'email', label: 'Email', icon: Mail },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-500">Configure store preferences and integrations</p>
        </div>
        <button onClick={handleSave} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${saved ? 'bg-green-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
          {saved ? <><Save size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>
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
                  <option value="PHP">PHP (₱)</option><option value="USD">USD ($)</option>
                </select>
              </div>
              <div><Label>Timezone</Label>
                <select value={store.timezone} onChange={e => setStore(s => ({...s, timezone: e.target.value}))} className={inputClass}>
                  <option value="Asia/Manila">Asia/Manila (GMT+8)</option><option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div><Label>Logo URL</Label><input value={store.logo} onChange={e => setStore(s => ({...s, logo: e.target.value}))} className={inputClass} placeholder="https://..." /></div>
          </div>
        )}

        {/* Tax */}
        {tab === 'tax' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-semibold text-gray-900">Tax Configuration</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={tax.enabled} onChange={e => setTax(t => ({...t, enabled: e.target.checked}))} className="w-4 h-4 text-red-600 rounded focus:ring-red-500" />
              Enable Tax Collection
            </label>
            {tax.enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-red-100">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Tax Name</Label><input value={tax.name} onChange={e => setTax(t => ({...t, name: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Tax Rate (%)</Label><input type="number" step="0.1" value={tax.rate} onChange={e => setTax(t => ({...t, rate: e.target.value}))} className={inputClass} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={tax.inclusive} onChange={e => setTax(t => ({...t, inclusive: e.target.checked}))} className="w-4 h-4 text-red-600 rounded" />
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
                  <div><Label>Flat Rate (₱)</Label><input type="number" value={shipping.flatRate} onChange={e => setShipping(s => ({...s, flatRate: e.target.value}))} className={inputClass} /></div>
                  <div><Label>Free Shipping Threshold (₱)</Label><input type="number" value={shipping.freeThreshold} onChange={e => setShipping(s => ({...s, freeThreshold: e.target.value}))} className={inputClass} /></div>
                </div>
              </div>
              <div className="p-4 border border-gray-100 rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-gray-900">Express Shipping</h4>
                <div><Label>Express Rate (₱)</Label><input type="number" value={shipping.expressRate} onChange={e => setShipping(s => ({...s, expressRate: e.target.value}))} className={inputClass} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer p-3 border border-gray-100 rounded-lg">
                <input type="checkbox" checked={shipping.enablePickup} onChange={e => setShipping(s => ({...s, enablePickup: e.target.checked}))} className="w-4 h-4 text-red-600 rounded" />
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
                <label key={m.key} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${payment[m.key] ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
                  <span className="text-sm font-medium text-gray-900">{m.label}</span>
                  <input type="checkbox" checked={payment[m.key]} onChange={e => setPayment(p => ({...p, [m.key]: e.target.checked}))} className="w-4 h-4 text-red-600 rounded" />
                </label>
              ))}
            </div>
            {payment.card && (
              <div className="space-y-3 p-4 border border-gray-100 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900">Stripe Configuration</h4>
                <div><Label>Publishable Key</Label><input type="password" value={payment.stripeKey} onChange={e => setPayment(p => ({...p, stripeKey: e.target.value}))} className={inputClass} placeholder="pk_..." /></div>
                <div><Label>Secret Key</Label><input type="password" value={payment.stripeSecret} onChange={e => setPayment(p => ({...p, stripeSecret: e.target.value}))} className={inputClass} placeholder="sk_..." /></div>
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
