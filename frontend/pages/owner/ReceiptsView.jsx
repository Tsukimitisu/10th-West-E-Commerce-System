import React, { useEffect, useState } from 'react';
import { getOrders } from '../../services/api';
import { FileText, Search, Printer, Mail, Eye, Receipt, Calendar, Download } from 'lucide-react';
import Modal from '../../components/owner/Modal';

const ReceiptsView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewOrder, setPreviewOrder] = useState(null);
  const [tab, setTab] = useState('history');

  useEffect(() => {
    (async () => {
      try { const o = await getOrders(); setOrders(o.filter((o) => o.status !== 'cancelled')); } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const filtered = orders.filter(o => {
    const term = search.toLowerCase();
    return !term || o.id.toString().includes(term) || o.customer_name?.toLowerCase().includes(term);
  });

  const handlePrint = (order) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`
      <html><head><title>Receipt #${order.id}</title><style>
        body{font-family:monospace;padding:20px;max-width:350px;margin:0 auto}
        h2{text-align:center;margin:0}p{margin:4px 0;font-size:12px}
        .line{border-top:1px dashed #000;margin:8px 0}
        .total{font-size:16px;font-weight:bold}
        .center{text-align:center}
      </style></head><body>
        <h2>10TH WEST MOTO</h2>
        <p class="center">Motorcycle Parts & Accessories</p>
        <div class="line"></div>
        <p>Receipt #: ${order.id.toString().padStart(4, '0')}</p>
        <p>Date: ${new Date(order.created_at).toLocaleString()}</p>
        <p>Customer: ${order.customer_name || order.shipping_name || 'Walk-in'}</p>
        <div class="line"></div>
        ${order.items?.map((it) => `<p>${it.name || it.product_name} x${it.quantity} — ₱${((it.price || 0) * (it.quantity || 1)).toFixed(2)}</p>`).join('') || '<p>Items unavailable</p>'}
        <div class="line"></div>
        <p class="total">TOTAL: ₱${(order.total_amount || 0).toFixed(2)}</p>
        <p>Payment: ${order.payment_method || 'N/A'}</p>
        <div class="line"></div>
        <p class="center">Thank you for your purchase!</p>
        <p class="center">www.10thwestmoto.com</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const [template, setTemplate] = useState({
    storeName: '10TH WEST MOTO',
    tagline: 'Motorcycle Parts & Accessories',
    address: 'Manila, Philippines',
    phone: '+63 XXX XXX XXXX',
    footer: 'Thank you for your purchase!',
    showLogo: true,
    showBarcode: true,
    width: '80mm',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Receipts</h1>
          <p className="text-sm text-gray-500">Receipt history and template configuration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit">
        {[
          { id: 'history', label: 'Receipt History', icon: FileText },
          { id: 'template', label: 'Template Editor', icon: Receipt },
        ].map(t => (
          <button key={t.id} onClick={() => setTabt.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-orange-50 text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <>
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search receipts..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center"><FileText size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">No receipts found</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Receipt #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Payment</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-32">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3"><span className="font-medium text-gray-900 font-mono">RCT-{o.id.toString().padStart(4, '0')}</span></td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{o.customer_name || o.shipping_name || `User ${o.user_id}`}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 capitalize hidden md:table-cell">{o.payment_method || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">₱{(o.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setPreviewOrder(o)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="Preview"><Eye size={14} /></button>
                          <button onClick={() => handlePrint(o)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-green-600 transition-colors" title="Print"><Printer size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'template' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-display font-semibold text-gray-900">Template Settings</h3>
            {[
              { key: 'storeName', label: 'Store Name' },
              { key: 'tagline', label: 'Tagline' },
              { key: 'address', label: 'Address' },
              { key: 'phone', label: 'Phone' },
              { key: 'footer', label: 'Footer Message' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                <input value={template[field.key]} onChange={e => setTemplate(t => ({...t, [field.key]: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
              </div>
            ))}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={template.showLogo} onChange={e => setTemplate(t => ({...t, showLogo: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded" />
                Show Logo
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={template.showBarcode} onChange={e => setTemplate(t => ({...t, showBarcode: e.target.checked}))} className="w-4 h-4 text-orange-500 rounded" />
                Show Barcode
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paper Width</label>
              <select value={template.width} onChange={e => setTemplate(t => ({...t, width: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20">
                <option value="58mm">58mm (Mini)</option>
                <option value="80mm">80mm (Standard)</option>
                <option value="A4">A4 (Full Page)</option>
              </select>
            </div>
            <button className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors w-full">Save Template</button>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-display font-semibold text-gray-900 mb-4">Preview</h3>
            <div className="bg-gray-50 rounded-lg p-6 font-mono text-xs max-w-[300px] mx-auto border border-dashed border-gray-300">
              {template.showLogo && <div className="text-center mb-1"><div className="w-8 h-8 bg-orange-500 rounded mx-auto mb-1 flex items-center justify-center"><span className="text-white font-bold text-[8px]">10</span></div></div>}
              <p className="text-center font-bold text-sm">{template.storeName}</p>
              <p className="text-center text-gray-500">{template.tagline}</p>
              <p className="text-center text-gray-500">{template.address}</p>
              <p className="text-center text-gray-500">{template.phone}</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p>Receipt #: RCT-0001</p>
              <p>Date: {new Date().toLocaleString()}</p>
              <p>Customer: Walk-in</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p>Brake Pad Set x1 — ₱450.00</p>
              <p>Oil Filter x2 — ₱300.00</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p className="font-bold text-base">TOTAL: ₱750.00</p>
              <p>Payment: Cash</p>
              <p>Change: ₱250.00</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              {template.showBarcode && <div className="h-8 bg-gradient-to-r from-gray-900 via-gray-400 to-gray-900 rounded my-2" style={{ backgroundSize: '4px 100%', backgroundImage: 'repeating-linear-gradient(90deg, #000 0px, #000 1px, #fff 1px, #fff 3px)' }} />}
              <p className="text-center text-gray-500">{template.footer}</p>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      <Modal isOpen={!!previewOrder} onClose={() => setPreviewOrder(null)} title={`Receipt Preview — #${previewOrder?.id.toString().padStart(4, '0') || ''}`} size="md">
        {previewOrder && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-6 font-mono text-xs max-w-[300px] mx-auto border border-dashed border-gray-300">
              <p className="text-center font-bold text-sm">{template.storeName}</p>
              <p className="text-center text-gray-500">{template.tagline}</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p>Receipt #: RCT-{previewOrder.id.toString().padStart(4, '0')}</p>
              <p>Date: {new Date(previewOrder.created_at).toLocaleString()}</p>
              <p>Customer: {previewOrder.customer_name || 'Walk-in'}</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              {previewOrder.items?.map((it, i) => (
                <p key={i}>{it.name || it.product_name} x{it.quantity} — ₱{((it.price || 0) * (it.quantity || 1)).toFixed(2)}</p>
              )) || <p>Items unavailable</p>}
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p className="font-bold text-base">TOTAL: ₱{(previewOrder.total_amount || 0).toFixed(2)}</p>
              <div className="border-t border-dashed border-gray-400 my-3" />
              <p className="text-center text-gray-500">{template.footer}</p>
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={() => { handlePrint(previewOrder); setPreviewOrder(null); }} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"><Printer size={12} /> Print</button>
              <button onClick={() => setPreviewOrder(null)} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReceiptsView;
