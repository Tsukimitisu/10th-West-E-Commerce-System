import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createInventoryItem, getInventory, getStockAdjustments, getLowStockProducts, getMotorcycleModels, adjustStock, updateInventoryItem } from '../../services/api';
import { Boxes, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Package, TrendingUp, History, Plus, ScanBarcode, Pencil, Bike, CheckCircle2, XCircle } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import ReceiveStock from '../../components/owner/ReceiveStock';
import { useSocketEvent } from '../../context/SocketContext';
import PageHeader from '../../components/operations/PageHeader';
import MetricCard from '../../components/operations/MetricCard';
import { SearchField } from '../../components/operations/FilterBar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Pagination } from '../../components/ui/BrandPrimitives';
import EmptyState from '../../components/ui/EmptyState';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import InventoryItemForm from '../../components/owner/InventoryItemForm';
import MotorcycleModelManager from '../../components/owner/MotorcycleModelManager';

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

const formatPeso = (value, fractionDigits = 2) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;

const quantityTone = { danger: 'text-red-700', warning: 'text-amber-700', success: 'text-slate-950' };

const stockStatus = (product) => {
  const quantity = Number(product.stock_quantity || 0);
  if (quantity <= 0) return { tone: 'danger', label: 'Out of stock', icon: XCircle };
  if (quantity <= Number(product.low_stock_threshold || 0)) return { tone: 'warning', label: 'Low stock', icon: AlertTriangle };
  return { tone: 'success', label: 'In stock', icon: CheckCircle2 };
};

const ItemThumb = ({ product }) => (
  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
    {product.image
      ? <img src={resolveProductImageUrl(product.image)} alt="" width="40" height="40" loading="lazy" onError={handleProductImageError} className="h-full w-full object-cover" />
      : <Package size={16} className="text-slate-400" aria-hidden="true" />}
  </span>
);

const InventoryView = () => {
  const location = useLocation();
  const catalogNotice = location.state?.catalogNotice || '';
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [motorcycleModels, setMotorcycleModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('stock');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [adjustModal, setAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjForm, setAdjForm] = useState({ type: 'add', quantity: '', reason: 'restocking', notes: '' });

  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modelModal, setModelModal] = useState(false);
  const [modelSelectCallback, setModelSelectCallback] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const fetchData = async () => {
    try {
      const [p, a, ls, modelRows] = await Promise.all([getInventory(), getStockAdjustments(), getLowStockProducts(), getMotorcycleModels({ includeInactive: true, manage: true })]);
      setProducts(Array.isArray(p) ? p : []);
      setAdjustments(Array.isArray(a) ? a : []);
      // getLowStockProducts returns { count, products } or an array
      setLowStock(Array.isArray(ls) ? ls : (ls?.products || []));
      setMotorcycleModels(Array.isArray(modelRows) ? modelRows : []);
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
      setAdjustModal(false);
      setFeedback({ type: 'success', text: 'Inventory stock updated successfully.' });
      fetchData();
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
      || String(p.color || '').toLowerCase().includes(term)
      || String(p.box_location || '').toLowerCase().includes(term);
  });

  // Presentation-only sorting/paging; stock values and mutation handlers stay intact.
  const stockRows = filtered.filter((item) => stockFilter === 'all' || stockStatus(item).tone === stockFilter);
  const sortedRows = [...stockRows].sort((a, b) => {
    const left = sortField === 'name' ? a.product_name || a.name : a[sortField];
    const right = sortField === 'name' ? b.product_name || b.name : b[sortField];
    const result = ['stock_quantity', 'store_selling_price'].includes(sortField)
      ? Number(left || 0) - Number(right || 0)
      : String(left || '').localeCompare(String(right || ''), 'en', { numeric: true, sensitivity: 'base' });
    return sortDirection === 'asc' ? result : -result;
  });
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const saveInventoryItem = async (payload) => {
    const wasEditing = Boolean(editingItem);
    const saved = wasEditing
      ? await updateInventoryItem(editingItem.id, payload)
      : await createInventoryItem(payload);
    const term = search.trim().toLowerCase();
    const searchable = [saved.name, saved.product_name, saved.part_number, saved.brand, saved.motorcycle_model, saved.color, saved.box_location]
      .filter(Boolean).join(' ').toLowerCase();
    const hiddenBySearch = Boolean(term && !searchable.includes(term));
    setProducts((current) => wasEditing
      ? current.map((item) => Number(item.id) === Number(saved.id) ? saved : item)
      : [saved, ...current.filter((item) => Number(item.id) !== Number(saved.id))]);
    setItemModal(false);
    setEditingItem(null);
    setFeedback({
      type: 'success',
      text: wasEditing ? 'Inventory item updated successfully.' : 'Inventory item added successfully.',
      detail: hiddenBySearch ? 'Item was added but hidden by current filters. Clear filters to view it.' : null,
    });
    await fetchData();
  };

  const openModelManager = (selectCallback = null) => {
    setModelSelectCallback(() => selectCallback);
    setModelModal(true);
  };

  const refreshModels = async () => {
    const rows = await getMotorcycleModels({ includeInactive: true, manage: true });
    setMotorcycleModels(Array.isArray(rows) ? rows : []);
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
        title="Inventory management"
        description="Manage official part data, Box locations, store pricing and stock used by POS and the online catalog."
        actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => openModelManager()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Bike size={16} /> Motorcycle Models</button><button type="button" onClick={() => { setEditingItem(null); setItemModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"><Plus size={16} /> Add Inventory Item</button></div>}
      />

      {catalogNotice && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {catalogNotice}
        </div>
      )}

      {feedback && (
        <div role="status" className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <div><p className="font-semibold">{feedback.text}</p>{feedback.detail && <p className="mt-0.5 text-xs">{feedback.detail}</p>}</div>
          {feedback.detail && <button type="button" onClick={() => setSearch('')} className="shrink-0 font-semibold underline underline-offset-2">Clear filters</button>}
        </div>
      )}

      <div tabIndex={0} className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&>*]:min-w-[13rem] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:min-w-0">
        <MetricCard icon={Boxes} label="Units on hand" value={totalStock.toLocaleString('en-PH')} detail={`${products.length.toLocaleString('en-PH')} inventory items`} tone="neutral" />
        <MetricCard icon={TrendingUp} label="Inventory value" value={formatPeso(totalValue, 0)} detail="At cost price" tone="neutral" />
        <MetricCard icon={Package} label="Reserved / damaged" value={`${reservedStock} / ${damagedStock}`} detail="Units not sellable" tone="neutral" />
        <MetricCard icon={AlertTriangle} label="Low / out of stock" value={`${lowStock.length} / ${outOfStock}`} detail="Open restock list" tone={lowStock.length || outOfStock ? 'warning' : 'success'} onClick={() => setTab('alerts')} />
      </div>

      <div tabIndex={0} className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit" role="tablist" aria-label="Inventory views">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <t.icon size={15} aria-hidden="true" />
            {t.label}
            {t.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tab === t.id ? 'bg-orange-100 text-orange-800' : 'bg-white text-slate-600'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Receive Items Tab */}
      {tab === 'receive' && (
        <ReceiveStock
          products={products}
          motorcycleModels={motorcycleModels}
          onAddMotorcycleModel={openModelManager}
          onComplete={async () => { await fetchData(); setFeedback({ type: 'success', text: 'Stock received successfully.' }); }}
          onBack={() => setTab('stock')}
        />
      )}

      {/* Stock Levels Tab */}
      {tab === 'stock' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Stock levels">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search part number, name, model, brand, color, or Box"
              className="w-full sm:max-w-md"
            />
            <p className="text-xs text-slate-500">
              <span className="font-semibold tabular-nums text-slate-700">{filtered.length}</span> of {products.length} items · type or scan a part number or barcode
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-3">
            <select aria-label="Filter inventory by stock" value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1); }} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm sm:flex-none">
              <option value="all">All stock</option><option value="success">In stock</option><option value="warning">Low stock</option><option value="danger">Out of stock</option>
            </select>
            <select aria-label="Sort inventory" value={sortField} onChange={(event) => { setSortField(event.target.value); setPage(1); }} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm sm:flex-none">
              <option value="name">Item name</option><option value="part_number">Part number</option><option value="motorcycle_model">Model</option><option value="box_location">Box location</option><option value="stock_quantity">Available stock</option><option value="store_selling_price">Store price</option>
            </select>
            <button type="button" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium" aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}>{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</button>
            <button type="button" onClick={() => setTab('receive')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold sm:ml-auto"><ScanBarcode size={17} aria-hidden="true" />Barcode Scan</button>
          </div>
          {loading ? (
            <div className="space-y-2 p-3" role="status" aria-label="Loading inventory">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton h-12 w-full rounded-lg" />)}
            </div>
          ) : stockRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Boxes}
                title={products.length === 0 ? 'No inventory items yet' : 'No items match your search'}
                description={products.length === 0 ? 'Add an inventory item or receive stock to start tracking parts.' : 'Check the part number or try a model, brand, color, or Box location.'}
                action={search || stockFilter !== 'all' ? <button type="button" onClick={() => { setSearch(''); setStockFilter('all'); setPage(1); }} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear search</button> : null}
              />
            </div>
          ) : (
            <>
              <div tabIndex={0} role="region" aria-label="Inventory stock table" className="hidden max-h-[70vh] overflow-auto md:block">
                <table className="w-full min-w-[1220px] text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-100">
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-700">Part number</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Item name</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Model</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Color</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-700">Box location</th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700">Available stock</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Minimum stock</th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700">Store price</th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700">Online price</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-700">Status</th>
                    <th scope="col" className="relative px-4 py-2.5 text-right text-xs font-semibold text-slate-700"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map(p => {
                      const status = stockStatus(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{p.part_number || '—'}</td>
                          <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><ItemThumb product={p} /><span className="max-w-[240px] truncate font-semibold text-slate-950">{p.product_name || p.name}</span></div></td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{p.motorcycle_model || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{p.color || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-slate-700"><span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-800">{p.box_location || 'Not assigned'}</span></td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-semibold tabular-nums ${quantityTone[status.tone]}`}>{p.stock_quantity}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{p.low_stock_threshold}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{formatPeso(p.store_selling_price)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{formatPeso(p.ecommerce_price)}</td>
                          <td className="px-4 py-2.5"><StatusBadge tone={status.tone} icon={status.icon}>{status.label}</StatusBadge></td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => { setEditingItem(p); setItemModal(true); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" aria-label={`Edit ${p.product_name || p.name}`}><Pencil size={13} aria-hidden="true" /> Edit</button>
                              <button type="button" onClick={() => openAdjust(p)} className="inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800" aria-label={`Adjust stock for ${p.product_name || p.name}`}>Adjust</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 md:hidden">
                {visibleRows.map(p => {
                  const status = stockStatus(p);
                  return (
                    <li key={p.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <ItemThumb product={p} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-sm font-semibold leading-5 text-slate-950">{p.product_name || p.name}</p>
                            <StatusBadge tone={status.tone} icon={status.icon}>{status.label}</StatusBadge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500"><span className="font-mono text-slate-600">{p.part_number || '—'}</span>{` · ${p.motorcycle_model || 'Model not set'}`}{p.color ? ` · ${p.color}` : ''}</p>
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <div><dt className="text-slate-500">Available</dt><dd className={`mt-0.5 text-sm font-semibold tabular-nums ${quantityTone[status.tone]}`}>{p.stock_quantity}</dd></div>
                        <div className="min-w-0"><dt className="text-slate-500">Box</dt><dd className="mt-0.5 truncate text-sm font-semibold text-slate-950">{p.box_location || '—'}</dd></div>
                        <div><dt className="text-slate-500">Store price</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-950">{formatPeso(p.store_selling_price)}</dd></div>
                      </dl>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setEditingItem(p); setItemModal(true); }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"><Pencil size={14} aria-hidden="true" /> Edit</button>
                        <button type="button" onClick={() => openAdjust(p)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">Adjust stock</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-slate-200 px-3"><Pagination page={currentPage} totalPages={pageCount} onChange={setPage} /></div>
            </>
          )}
        </section>
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
                  <button onClick={() => openAdjust(p)} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1">
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
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${adjForm.type === 'add' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-900'}`}>
              <ArrowUpCircle size={16} /> Add Stock
            </button>
            <button type="button" onClick={() => setAdjForm(f => ({...f, type: 'remove', reason: STOCK_ADJUSTMENT_REASONS.remove[0][0]}))}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${adjForm.type === 'remove' ? 'bg-red-500/10 border-red-200 text-orange-600' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-900'}`}>
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
            <div className={`p-3 rounded-lg text-sm font-medium ${adjForm.type === 'add' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-800'}`}>
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
          motorcycleModels={motorcycleModels}
          onAddMotorcycleModel={openModelManager}
          onPartNumberScanned={(value) => {
            const normalized = String(value || '').trim().toLowerCase();
            const existing = products.find((item) => [item.part_number, item.partNumber, item.sku, item.barcode]
              .some((candidate) => String(candidate || '').trim().toLowerCase() === normalized));
            if (existing) {
              setEditingItem(existing);
              setFeedback({ type: 'success', text: 'Existing inventory item loaded from scan.' });
            }
          }}
          onSubmit={saveInventoryItem}
          onCancel={() => { setItemModal(false); setEditingItem(null); }}
        />
      </Modal>

      <Modal isOpen={modelModal} onClose={() => { setModelModal(false); setModelSelectCallback(null); }} title="Motorcycle Models" size="2xl">
        <MotorcycleModelManager
          models={motorcycleModels}
          onChanged={refreshModels}
          onSelect={modelSelectCallback ? (model) => { modelSelectCallback(model); setModelModal(false); setModelSelectCallback(null); } : undefined}
        />
      </Modal>
    </div>
  );
};

export default InventoryView;


