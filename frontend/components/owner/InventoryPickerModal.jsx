import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, PackageSearch, Search, X } from 'lucide-react';

const PAGE_SIZE = 10;

const InventoryPickerModal = ({ open, items = [], listings = [], onClose, onSelect }) => {
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('active');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const listedIds = useMemo(() => new Set(listings.map((listing) => Number(listing.inventory_item_id))), [listings]);
  const models = useMemo(() => [...new Set(items.map((item) => item.motorcycle_model).filter(Boolean))].sort(), [items]);
  const brands = useMemo(() => [...new Set(items.map((item) => item.brand).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const searchable = [item.part_number, item.product_name, item.name, item.motorcycle_model, item.brand, item.color, item.box_location]
        .filter(Boolean).join(' ').toLowerCase();
      return (!term || searchable.includes(term))
        && (!model || item.motorcycle_model === model)
        && (!brand || item.brand === brand)
        && (!status || item.inventory_status === status)
        && (!inStockOnly || Number(item.stock_quantity || 0) > 0);
    });
  }, [brand, inStockOnly, items, model, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, model, brand, status, inStockOnly]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    const keyHandler = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && event.target === searchRef.current) {
        event.preventDefault();
        event.stopPropagation();
        const first = rows.find((item) => !listedIds.has(Number(item.id)));
        if (first) onSelect(first);
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', keyHandler); };
  }, [listedIds, onClose, onSelect, open, rows]);

  if (!open) return null;
  const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Choose Inventory Item">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-6xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-lg font-bold text-slate-950">Choose Inventory Item</h2><p className="mt-1 text-xs text-slate-500">Search the inventory source of truth. Already-listed records cannot be selected again.</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close inventory picker"><X size={18} /></button>
        </div>
        <div className="border-b border-slate-200 p-4">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15" placeholder="Search part number, product, model, brand, color or Box…" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All Motorcycle Models</option>{models.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={brand} onChange={(event) => setBrand(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All Brands</option>{brands.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /> In stock only</label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><PackageSearch className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm font-semibold text-slate-700">No inventory items match</p><p className="mt-1 text-xs text-slate-500">Try a different search or clear a filter.</p></div></div> : (
            <div className="divide-y divide-slate-100">
              {rows.map((item) => {
                const listed = listedIds.has(Number(item.id));
                return <div key={item.id} className="grid gap-3 px-4 py-4 hover:bg-slate-50 lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] lg:items-center">
                  <div><p className="font-mono text-xs font-bold text-orange-700">{item.part_number}</p><p className="mt-1 text-sm font-semibold text-slate-950">{item.product_name || item.name}</p><p className="text-xs text-slate-500">{item.motorcycle_model || 'Model not set'} · {item.brand || 'Brand not set'} · {item.color || 'No color specified'}</p></div>
                  <div className="text-xs text-slate-600"><p>Box: <span className="font-semibold text-slate-800">{item.box_location || 'Not assigned'}</span></p><p>Status: <span className="font-semibold capitalize text-slate-800">{item.inventory_status}</span></p></div>
                  <div className="text-xs text-slate-600"><p>Store {money(item.store_selling_price)}</p><p className="font-semibold text-slate-900">Online {money(item.ecommerce_price)}</p></div>
                  <p className="text-xs text-slate-600"><span className="font-bold text-slate-950">{item.stock_quantity}</span> in stock</p>
                  <button type="button" disabled={listed} onClick={() => onSelect(item)} className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${listed ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-slate-950 text-white hover:bg-orange-600'}`}>
                    {listed ? <><Check size={13} /> Already listed</> : 'Select item'}
                  </button>
                </div>;
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button></div>
        </div>
      </div>
    </div>
  );
};

export default InventoryPickerModal;
