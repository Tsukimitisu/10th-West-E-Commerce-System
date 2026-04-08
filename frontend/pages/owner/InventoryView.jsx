import React, { useEffect, useState } from 'react';
import { getInventory, getStockAdjustments, getLowStockProducts, adjustStock } from '../../services/api';
import { Boxes, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Search, Package, TrendingUp, TrendingDown, History, Plus, Minus, ScanBarcode } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import ReceiveStock from '../../components/owner/ReceiveStock';
import { useSocketEvent } from '../../context/SocketContext';

const InventoryView = () => {
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('stock');
  const [adjustModal, setAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjForm, setAdjForm] = useState({ type: 'add', quantity: '', reason: 'restock', notes: '' });

  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState('');

  const fetchData = async () => {
    try {
      const [p, a, ls] = await Promise.all([getInventory(), getStockAdjustments(), getLowStockProducts()]);
      setProducts(Array.isArray(p) ? p : []);
      setAdjustments(Array.isArray(a) ? a : []);
      // getLowStockProducts returns { count, products } or an array
      setLowStock(Array.isArray(ls) ? ls : (ls?.products || []));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Real-time: refresh on stock changes
  useSocketEvent('inventory:updated', fetchData);
  useSocketEvent('inventory:low-stock', fetchData);
  useSocketEvent('product:created', fetchData);
  useSocketEvent('product:deleted', fetchData);

  const openAdjust = (p) => { setSelectedProduct(p); setAdjForm({ type: 'add', quantity: '', reason: 'restock', notes: '' }); setAdjError(''); setAdjustModal(true); };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!selectedProduct || adjLoading) return;
    setAdjLoading(true);
    setAdjError('');
    try {
      await adjustStock({
        product_id: selectedProduct.id,
        quantity_change: adjForm.type === 'add' ? parseInt(adjForm.quantity) : -parseInt(adjForm.quantity),
        reason: adjForm.reason,
        note: adjForm.notes
      });
      setAdjustModal(false); fetchData();
    } catch (err) {
      console.error(err);
      setAdjError(err?.message || 'Failed to adjust stock. Please try again.');
    } finally {
      setAdjLoading(false);
    }
  };

  const totalStock = products.reduce((s, p) => s + p.stock_quantity, 0);
  const totalValue = products.reduce((s, p) => s + (p.stock_quantity * p.price), 0);
  const outOfStock = products.filter(p => p.stock_quantity === 0).length;

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    return !term || p.name.toLowerCase().includes(term) || p.partNumber?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term);
  });

  const tabs = [
    { id: 'stock', label: 'Stock Levels', icon: Boxes, count: products.length },
    { id: 'receive', label: 'Receive Items', icon: ScanBarcode },
    { id: 'adjustments', label: 'Adjustment History', icon: History, count: adjustments.length },
    { id: 'alerts', label: 'Low Stock Alerts', icon: AlertTriangle, count: lowStock.length },
  ];

  const reasons = ['restock', 'damaged', 'returned', 'correction', 'shrinkage', 'transfer', 'expired', 'other'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Inventory & Stock Control</h1>
          <p className="text-sm text-gray-400">Manage product stock levels and adjustments</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ">
        {[
          { label: 'Total Units', value: totalStock.toLocaleString(), icon: <Boxes size={18} />, color: 'bg-blue-50 text-blue-600 ' },
          { label: 'Inventory Value', value: `₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, icon: <TrendingUp size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Low Stock', value: lowStock.length.toString(), icon: <AlertTriangle size={18} />, color: 'bg-amber-50 text-amber-600' },
          { label: 'Out of Stock', value: outOfStock.toString(), icon: <Package size={18} />, color: 'bg-red-500/10 text-red-500' },
        ].map((kpi, i) => (
          <div key={i} className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <p className="text-lg font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-lg border-b border-white/10 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-white'}`}>
            <t.icon size={14} />
            {t.label}
            {t.count != null && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-red-500/20 text-red-500' : 'bg-gray-100 text-gray-400'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Receive Items Tab */}
      {tab === 'receive' && (
        <ReceiveStock
          products={products}
          onComplete={fetchData}
          onBack={() => setTab('stock')}
        />
      )}

      {/* Stock Levels Tab */}
      {tab === 'stock' && (
        <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 overflow-hidden">
          <div className="p-3 border-b border-white/10">
            <div className="relative max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-700 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-[#202430]/80 border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Product</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Current Stock</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Threshold</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Value</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-24">Adjust</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map(p => {
                  const status = p.stock_quantity === 0 ? 'out' : p.stock_quantity <= p.low_stock_threshold ? 'low' : 'ok';
                  const pct = p.low_stock_threshold > 0 ? Math.min((p.stock_quantity / (p.low_stock_threshold * 3)) * 100, 100) : 100;
                  return (
                    <tr key={p.id} className="hover:bg-[#202430]/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-700">
                            {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="m-auto text-gray-400 mt-1.5" />}
                          </div>
                          <div><p className="font-medium text-white text-sm">{p.name}</p><p className="text-[10px] text-gray-400 font-mono">{p.sku || p.partNumber || '-'}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${status === 'out' ? 'bg-red-500/100' : status === 'low' ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`font-bold ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-600' : 'text-white'}`}>{p.stock_quantity}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">{p.low_stock_threshold}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${status === 'out' ? 'bg-red-500/10 text-red-500' : status === 'low' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                          {status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white hidden md:table-cell">₱{(p.stock_quantity * p.price).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openAdjust(p)} className="px-2.5 py-1 bg-gray-900 hover:bg-gray-100 border border-gray-700 rounded-lg text-xs font-medium text-gray-600 transition-colors">Adjust</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjustments History Tab */}
      {tab === 'adjustments' && (
        <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 overflow-hidden">
          {adjustments.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No adjustments recorded</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-[#202430]/80 border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Type</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Qty</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Reason</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {adjustments.slice(0, 50).map((a, i) => {
                  const prod = products.find(p => p.id === a.product_id);
                  const qty = a.quantity_change ?? a.quantity ?? 0;
                  const isAdd = qty > 0;
                  return (
                    <tr key={i} className="hover:bg-[#202430]/60">
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white text-sm">{a.product_name || prod?.name || `Product #${a.product_id}`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isAdd ? 'bg-green-50 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                          {isAdd ? <ArrowUpCircle size={10} /> : <ArrowDownCircle size={10} />}
                          {isAdd ? 'Added' : 'Removed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-sm">{isAdd ? '+' : ''}{qty}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 capitalize">{a.reason || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Low Stock Alerts Tab */}
      {tab === 'alerts' && (
        <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border-b border-white/10 overflow-hidden">
          {lowStock.length === 0 ? (
            <div className="p-12 text-center"><AlertTriangle size={36} className="mx-auto text-green-300 mb-2" /><p className="text-sm text-green-600 font-medium">All stock levels are healthy!</p></div>
          ) : (
            <div className="divide-y divide-white/10">
              {lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 hover:bg-[#202430]/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.stock_quantity === 0 ? 'bg-red-500/10' : 'bg-amber-50'}`}>
                      <AlertTriangle size={16} className={p.stock_quantity === 0 ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">{p.name}</p>
                      <p className="text-xs text-gray-400">Threshold: {p.low_stock_threshold} {'\u2022'} Current: <span className={`font-bold ${p.stock_quantity === 0 ? 'text-red-500' : 'text-amber-600'}`}>{p.stock_quantity}</span></p>
                    </div>
                  </div>
                  <button onClick={() => openAdjust(p)} className="px-3 py-1.5 bg-red-500/100 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1">
                    <Plus size={12} /> Restock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Modal */}
      <Modal isOpen={adjustModal} onClose={() => setAdjustModal(false)} title={`Adjust Stock - ${selectedProduct?.name || ''}`} size="md">
        <form onSubmit={handleAdjust} className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg">
            <div className="w-10 h-10 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              {selectedProduct?.image ? <img src={selectedProduct.image} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="m-auto text-gray-400 mt-2.5" />}
            </div>
            <div>
              <p className="font-medium text-white text-sm">{selectedProduct?.name}</p>
              <p className="text-xs text-gray-400">Current stock: <span className="font-bold text-white">{selectedProduct?.stock_quantity}</span></p>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setAdjForm(f => ({...f, type: 'add'}))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${adjForm.type === 'add' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-900'}`}>
              <ArrowUpCircle size={16} /> Add Stock
            </button>
            <button type="button" onClick={() => setAdjForm(f => ({...f, type: 'remove'}))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${adjForm.type === 'remove' ? 'bg-red-500/10 border-red-200 text-orange-600' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-900'}`}>
              <ArrowDownCircle size={16} /> Remove Stock
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
            <input type="number" min="1" value={adjForm.quantity} onChange={e => setAdjForm(f => ({...f, quantity: e.target.value}))}
              required className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" placeholder="Enter quantity" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <select value={adjForm.reason} onChange={e => setAdjForm(f => ({...f, reason: e.target.value}))}
              className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20">
              {reasons.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea value={adjForm.notes} onChange={e => setAdjForm(f => ({...f, notes: e.target.value}))} rows={2}
              className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" placeholder="Additional details..." />
          </div>

          {adjForm.quantity && (
            <div className={`p-3 rounded-lg text-sm font-medium ${adjForm.type === 'add' ? 'bg-green-50 text-green-700' : 'bg-red-500/10 text-orange-600'}`}>
              New stock: {selectedProduct?.stock_quantity || 0} {'\u2192'} <span className="font-bold">
                {adjForm.type === 'add' ? (selectedProduct?.stock_quantity || 0) + parseInt(adjForm.quantity || '0') : Math.max(0, (selectedProduct?.stock_quantity || 0) - parseInt(adjForm.quantity || '0'))}
              </span>
            </div>
          )}

          {adjError && (
            <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">{adjError}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdjustModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={adjLoading} className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${adjForm.type === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500/100 hover:bg-red-600'}`}>
              {adjLoading ? 'Processing...' : adjForm.type === 'add' ? 'Add Stock' : 'Remove Stock'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryView;


