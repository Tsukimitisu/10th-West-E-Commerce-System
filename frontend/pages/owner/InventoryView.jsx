import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createInventoryItem, getCategories, getInventory, getStockAdjustments, getLowStockProducts, adjustStock, updateInventoryItem } from '../../services/api';
import { Boxes, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Search, Package, TrendingUp, History, Plus, ScanBarcode, Pencil } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import ReceiveStock from '../../components/owner/ReceiveStock';
import { useSocketEvent } from '../../context/SocketContext';
import PageHeader from '../../components/operations/PageHeader';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import InventoryItemForm from '../../components/owner/InventoryItemForm';

const STOCK_ADJUSTMENT_REASONS = Object.freeze({
  add: [
    ['restocking', 'Restocking'],
    ['returned', 'Customer return'],
    ['correction_add', 'Correction (add)'],
    ['supplier_delivery', 'Supplier delivery'],
    ['initial_stock', 'Initial stock'],
  ],
  remove: [
    ['damaged', 'Damaged'],
    ['expired', 'Expired'],
    ['correction_remove', 'Correction (remove)'],
    ['sold_adjustment', 'Sold adjustment'],
    ['lost', 'Lost'],
  ],
});

const formatLegacyReason = (reason) => String(reason || 'Not recorded')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const InventoryView = () => {
  const location = useLocation();
  const catalogNotice = location.state?.catalogNotice || '';
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('stock');
  const [adjustModal, setAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjForm, setAdjForm] = useState({ type: 'add', quantity: '', reason: 'restocking', notes: '' });

  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const fetchData = async () => {
    try {
      const [p, a, ls, categoryRows] = await Promise.all([getInventory(), getStockAdjustments(), getLowStockProducts(), getCategories()]);
      setProducts(Array.isArray(p) ? p : []);
      setAdjustments(Array.isArray(a) ? a : []);
      // getLowStockProducts returns { count, products } or an array
      setLowStock(Array.isArray(ls) ? ls : (ls?.products || []));
      setCategories(Array.isArray(categoryRows) ? categoryRows : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      getInventory(search).then((rows) => setProducts(Array.isArray(rows) ? rows : [])).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Real-time: refresh on stock changes
  useSocketEvent('inventory:updated', fetchData);
  useSocketEvent('inventory:low-stock', fetchData);
  useSocketEvent('product:created', fetchData);
  useSocketEvent('product:deleted', fetchData);

  const openAdjust = (p) => { setSelectedProduct(p); setAdjForm({ type: 'add', quantity: '', reason: 'restocking', notes: '' }); setAdjError(''); setAdjustModal(true); };

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
  const reservedStock = products.reduce((s, p) => s + Number(p.reserved_stock || 0), 0);
  const damagedStock = products.reduce((s, p) => s + Number(p.damaged_stock || 0), 0);
  const totalValue = products.reduce((s, p) => s + (p.stock_quantity * Number(p.cost_price ?? p.buying_price ?? 0)), 0);
  const outOfStock = products.filter(p => p.stock_quantity === 0).length;

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    return !term
      || String(p.name || '').toLowerCase().includes(term)
      || String(p.partNumber || p.part_number || '').toLowerCase().includes(term)
      || String(p.sku || '').toLowerCase().includes(term)
      || String(p.barcode || '').toLowerCase().includes(term)
      || String(p.brand || '').toLowerCase().includes(term)
      || String(p.motorcycle_model || '').toLowerCase().includes(term)
      || String(p.category_name || '').toLowerCase().includes(term)
      || String(p.box_location || '').toLowerCase().includes(term);
  });

  const saveInventoryItem = async (payload) => {
    if (editingItem) await updateInventoryItem(editingItem.id, payload);
    else await createInventoryItem(payload);
    setItemModal(false);
    setEditingItem(null);
    await fetchData();
  };

  const tabs = [
    { id: 'stock', label: 'Stock Levels', icon: Boxes, count: products.length },
    { id: 'receive', label: 'Receive Items', icon: ScanBarcode },
    { id: 'adjustments', label: 'Adjustment History', icon: History, count: adjustments.length },
    { id: 'alerts', label: 'Low Stock Alerts', icon: AlertTriangle, count: lowStock.length },
  ];

  const reasons = STOCK_ADJUSTMENT_REASONS[adjForm.type];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Inventory source of truth"
        title="Inventory management"
        description="Manage official part data, Box locations, store pricing and stock used by POS and the online catalog."
        actions={<button type="button" onClick={() => { setEditingItem(null); setItemModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"><Plus size={16} /> Add Inventory Item</button>}
      />

      {catalogNotice && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {catalogNotice}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ">
        {[
          { label: 'Total Units', value: totalStock.toLocaleString(), icon: <Boxes size={18} />, color: 'bg-blue-50 text-blue-600 ' },
          { label: 'Inventory Value', value: `₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, icon: <TrendingUp size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Reserved / Damaged', value: `${reservedStock} / ${damagedStock}`, icon: <Package size={18} />, color: 'bg-purple-50 text-purple-600' },
          { label: 'Low / Out', value: `${lowStock.length} / ${outOfStock}`, icon: <AlertTriangle size={18} />, color: 'bg-amber-50 text-amber-600' },
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
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-700'}`}>
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
              <input type="text" placeholder="Search part number, name, model, brand, category, or Box" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Barcode field/search only. Scanner integration is not configured. Enter or scan a product barcode if supported by your device.
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-700 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Current Stock</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-700 lg:table-cell">Box Location</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold text-slate-700 lg:table-cell">Store Price</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold text-slate-700 sm:table-cell">Threshold</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-700 md:table-cell">Status</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold text-slate-700 md:table-cell">Online Price</th>
                <th className="w-36 px-4 py-3 text-right text-xs font-semibold text-slate-700">Actions</th>
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
                            {p.image ? <img src={resolveProductImageUrl(p.image)} alt="" onError={handleProductImageError} className="w-full h-full object-cover" /> : <Package size={14} className="m-auto text-gray-400 mt-1.5" />}
                          </div>
                          <div><p className="font-medium text-white text-sm">{p.product_name || p.name}</p><p className="text-[10px] text-gray-400 font-mono">{p.part_number || '-'}</p><p className="text-[10px] text-gray-500">{p.motorcycle_model || p.brand || 'Model not set'}</p></div>
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
                      <td className="px-4 py-3 text-left text-gray-300 hidden lg:table-cell">{p.box_location || 'Not assigned'}</td>
                      <td className="px-4 py-3 text-right text-gray-300 hidden lg:table-cell">₱{Number(p.store_selling_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">{p.low_stock_threshold}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${status === 'out' ? 'bg-red-500/10 text-red-500' : status === 'low' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                          {status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white hidden md:table-cell">₱{Number(p.ecommerce_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => { setEditingItem(p); setItemModal(true); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700"><Pencil size={12} /> Edit</button>
                          <button onClick={() => openAdjust(p)} className="rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-700">Adjust</button>
                        </div>
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {adjustments.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No adjustments recorded</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Type</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Reason</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {adjustments.slice(0, 50).map((a, i) => {
                  const prod = products.find(p => p.id === a.product_id);
                  const qty = a.quantity_change ?? a.quantity ?? 0;
                  const isAdd = qty > 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50/50">
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
                      <td className="px-4 py-3 text-xs text-gray-400">{formatLegacyReason(a.reason)}</td>
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {lowStock.length === 0 ? (
            <div className="p-12 text-center"><AlertTriangle size={36} className="mx-auto text-green-300 mb-2" /><p className="text-sm text-green-600 font-medium">All stock levels are healthy!</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.stock_quantity === 0 ? 'bg-red-500/10' : 'bg-amber-50'}`}>
                      <AlertTriangle size={16} className={p.stock_quantity === 0 ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">{p.name}</p>
                      <p className="text-xs text-gray-400">Threshold: {p.low_stock_threshold} · Current: <span className={`font-bold ${p.stock_quantity === 0 ? 'text-red-500' : 'text-amber-600'}`}>{p.stock_quantity}</span></p>
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
            <button type="button" onClick={() => setAdjForm(f => ({...f, type: 'add', reason: STOCK_ADJUSTMENT_REASONS.add[0][0]}))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${adjForm.type === 'add' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-900'}`}>
              <ArrowUpCircle size={16} /> Add Stock
            </button>
            <button type="button" onClick={() => setAdjForm(f => ({...f, type: 'remove', reason: STOCK_ADJUSTMENT_REASONS.remove[0][0]}))}
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
              {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea value={adjForm.notes} onChange={e => setAdjForm(f => ({...f, notes: e.target.value}))} rows={2}
              className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" placeholder="Additional details..." />
          </div>

          {adjForm.quantity && (
            <div className={`p-3 rounded-lg text-sm font-medium ${adjForm.type === 'add' ? 'bg-green-50 text-green-700' : 'bg-red-500/10 text-orange-600'}`}>
              New stock: {selectedProduct?.stock_quantity || 0} → <span className="font-bold">
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

      <Modal isOpen={itemModal} onClose={() => { setItemModal(false); setEditingItem(null); }} title={editingItem ? `Edit Inventory — ${editingItem.part_number}` : 'Add Inventory Item'} size="2xl">
        <InventoryItemForm
          key={editingItem?.id || 'new'}
          initialItem={editingItem}
          categories={categories}
          onSubmit={saveInventoryItem}
          onCancel={() => { setItemModal(false); setEditingItem(null); }}
        />
      </Modal>
    </div>
  );
};

export default InventoryView;


