import React, { useEffect, useState } from 'react';
import {
  Settings, Store, CreditCard, Truck, Mail,
  Save, Loader2, CheckCircle2, Percent, RotateCcw
} from 'lucide-react';
import { getSystemHealth, getSystemSettings, updateSystemSettings } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';

const formatOperationalTimestamp = (value) => (
  value ? new Date(value).toLocaleString('en-PH') : 'No activity recorded'
);

const SystemConfigView = () => {
  const [tab, setTab] = useState('store');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [providerHealth, setProviderHealth] = useState(null);

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
    cash_enabled: 'true', gcash_enabled: 'false',
  });

  const [email, setEmail] = useState({
    order_confirmation: 'true', shipping_update: 'true', return_approval: 'true',
    promotions: 'false', from_name: '10th West Moto', from_email: '',
  });

  const [returnsConfig, setReturnsConfig] = useState({
    return_window_days: '15',
  });

  useEffect(() => {
    (async () => {
      try {
        const [allSettings, health] = await Promise.all([
          getSystemSettings(),
          getSystemHealth().catch(() => null),
        ]);
        setProviderHealth(health);
        const parsed = { store: {}, tax: {}, shipping: {}, payment: {}, email: {}, returns: {} };
        (Array.isArray(allSettings) ? allSettings : []).forEach((setting) => {
          if (parsed[setting.category]) parsed[setting.category][setting.key] = setting.value;
        });
        if (Object.keys(parsed.store).length) setStore((prev) => ({ ...prev, ...parsed.store }));
        if (Object.keys(parsed.tax).length) setTax((prev) => ({ ...prev, ...parsed.tax }));
        if (Object.keys(parsed.shipping).length) setShipping((prev) => ({ ...prev, ...parsed.shipping }));
        if (Object.keys(parsed.payment).length) setPayment((prev) => ({ ...prev, ...parsed.payment }));
        if (Object.keys(parsed.email).length) setEmail((prev) => ({ ...prev, ...parsed.email }));
        if (Object.keys(parsed.returns).length) setReturnsConfig((prev) => ({ ...prev, ...parsed.returns }));
      } catch (error) {
        console.error(error);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const map = { store, tax, shipping, payment, email, returns: returnsConfig };
      await updateSystemSettings(tab, map[tab]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'store', label: 'Store Info', icon: Store },
    { id: 'tax', label: 'Tax Rates', icon: Percent },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'payment', label: 'Payment Gateways', icon: CreditCard },
    { id: 'email', label: 'Email Services', icon: Mail },
    { id: 'returns', label: 'Returns', icon: RotateCcw },
  ];

  const Toggle = ({ value, onChange, label }) => (
    <button type="button" role="switch" aria-checked={value === 'true'} onClick={onChange} className="group flex items-center gap-3 text-left">
      <span className={`relative h-6 w-11 rounded-full transition-colors ${value === 'true' ? 'bg-orange-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <span className="text-sm text-slate-700 group-hover:text-slate-950">{label}</span>
    </button>
  );

  const Input = ({ label, value, onChange, placeholder, type = 'text', hint }) => (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
      />
      {hint && <p className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="System configuration"
        description="Manage store identity, tax, payments, shipping, email delivery, and return policy."
        actions={<button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? 'Saved' : 'Save changes'}
        </button>}
      />

      <div className="flex gap-1 bg-gray-800 border border-gray-700 p-1 rounded-xl overflow-x-auto shadow-sm">
        {tabs.map((tabOption) => {
          const Icon = tabOption.icon;
          return (
            <button
              key={tabOption.id}
              onClick={() => setTab(tabOption.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === tabOption.id ? 'bg-red-500/10 text-orange-600' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-900'}`}
            >
              <Icon size={14} /> {tabOption.label}
            </button>
          );
        })}
      </div>

      {tab === 'store' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Store size={16} className="text-gray-400" /> Store Information</h3>
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
              <select value={store.currency} onChange={(e) => setStore({ ...store, currency: e.target.value })} className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30">
                <option value="PHP">PHP - Philippine Peso</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Timezone</label>
              <select value={store.timezone} onChange={(e) => setStore({ ...store, timezone: e.target.value })} className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30">
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

      {tab === 'tax' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Percent size={16} className="text-gray-400" /> Tax Configuration</h3>
          <div className="space-y-5">
            <Toggle value={tax.enabled} onChange={() => setTax({ ...tax, enabled: tax.enabled === 'true' ? 'false' : 'true' })} label="Enable tax on orders" />
            {tax.enabled === 'true' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pl-2 border-l-2 border-red-300">
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

      {tab === 'shipping' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><Truck size={16} className="text-gray-400" /> Shipping Configuration</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ['Shipping provider', providerHealth?.shipping?.provider, providerHealth?.shipping?.status],
              ['Tracking provider', providerHealth?.tracking?.provider, providerHealth?.tracking?.status],
              ['Carrier', providerHealth?.shipping?.carrier === 'jtexpress-ph' ? 'J&T Express Philippines' : providerHealth?.shipping?.carrier, 'Via the configured aggregator; selected-city coverage applies'],
              ['Webhook URL', providerHealth?.shipping_activity?.webhook_url, 'Configure this URL with the provider'],
              ['Sender details', providerHealth?.shipping_activity?.sender_configured ? 'Configured' : 'Not configured', 'Credentials remain server-side'],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value || 'Unavailable'}</p>
                <p className="mt-1 text-xs text-gray-400">{detail || 'Not configured'}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ['Last successful booking', providerHealth?.shipping_activity?.last_successful_booking],
              ['Last tracking refresh', providerHealth?.shipping_activity?.last_tracking_refresh],
              ['Last webhook received', providerHealth?.shipping_activity?.last_webhook_received],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatOperationalTimestamp(value)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Recent provider errors</p>
            {providerHealth?.shipping_activity?.recent_provider_errors?.length ? (
              <div className="mt-3 space-y-2">
                {providerHealth.shipping_activity.recent_provider_errors.map((error, index) => (
                  <div key={`${error.order_id || 'provider'}-${error.updated_at || index}`} className="rounded-md border border-red-900/40 bg-red-950/20 p-3">
                    <p className="text-sm font-medium text-red-200">{error.message || 'Shipping provider operation failed.'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {error.order_id ? `Order #${error.order_id} · ` : ''}{formatOperationalTimestamp(error.updated_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-400">No provider errors recorded.</p>
            )}
          </div>
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

      {tab === 'payment' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard size={16} className="text-gray-400" /> Payment Methods</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'cash_enabled', label: 'Cash Payment', desc: 'Accept cash for POS and COD' },
              { key: 'gcash_enabled', label: 'GCash', desc: 'Accept GCash mobile payments' },
            ].map((method) => (
              <div key={method.key} className={`p-4 rounded-xl border transition-all ${payment[method.key] === 'true' ? 'border-red-300 bg-red-500/10' : 'border-gray-700 bg-gray-900'}`}>
                <Toggle value={payment[method.key]} onChange={() => setPayment({ ...payment, [method.key]: payment[method.key] === 'true' ? 'false' : 'true' })} label={method.label} />
                <p className="text-[10px] text-gray-400 mt-1 ml-13">{method.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mail size={16} className="text-gray-400" /> Email Configuration</h3>
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
              ].map((notification) => (
                <div key={notification.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-700">{notification.label}</p>
                    <p className="text-[10px] text-gray-400">{notification.desc}</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${email[notification.key] === 'true' ? 'bg-red-500/100' : 'bg-gray-300'}`} onClick={() => setEmail({ ...email, [notification.key]: email[notification.key] === 'true' ? 'false' : 'true' })}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-gray-800 rounded-full transition-all shadow-sm ${email[notification.key] === 'true' ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'returns' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2"><RotateCcw size={16} className="text-gray-400" /> Returns Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Return Window (days)"
              value={returnsConfig.return_window_days}
              onChange={(e) => setReturnsConfig({ ...returnsConfig, return_window_days: e.target.value })}
              placeholder="15"
              type="number"
              hint="Delivered orders can request returns only within this many days."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemConfigView;
