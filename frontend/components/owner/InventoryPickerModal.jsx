import React, { useEffect, useMemo, useRef } from 'react';
import { Check, PackageSearch, Plus, X } from 'lucide-react';
import { getInventoryPage } from '../../services/api.js';
import { useInventoryBrowser,useInventoryModels } from '../../hooks/useInventoryBrowser.js';
import InventoryFilters from '../operations/InventoryFilters.jsx';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';

const PAGE_SIZE = 10;

// multi=true picks several existing items for a set listing: items that already
// have their own single listing remain selectable; already-chosen ones toggle off.
const InventoryPickerModal = ({ open, items = [], listings = [], onClose, onSelect, multi = false, selectedIds = [] }) => {
  const searchRef = useRef(null);
  const browser = useInventoryBrowser(getInventoryPage,{pageSize:PAGE_SIZE,status:'active'},open);
  const models = useInventoryModels(open);
  const {query,result} = browser;
  const page = query.page,status = query.status,brand = query.brand || '';
  const inStockOnly = Boolean(query.in_stock_only);
  const listedIds = useMemo(() => new Set(multi ? [] : listings.map(listing => Number(listing.inventory_item_id))),[listings,multi]);
  const chosenIds = useMemo(() => new Set(selectedIds.map(Number)),[selectedIds]);
  const brands = result.summary?.brands || [...new Set(items.map(item=>item.brand).filter(Boolean))].sort();
  const rows = result.items || [],total = Number(result.total || 0);
  const pageCount = Math.max(1,Math.ceil(total/PAGE_SIZE));
  const setPage = value => browser.update({page:typeof value==='function'?value(page):value});

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => searchRef.current?.querySelector('input[type=search]')?.focus(), 50);
    const keyHandler = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && event.target === searchRef.current?.querySelector('input[type=search]')) {
        event.preventDefault();
        event.stopPropagation();
        if (browser.loading) return;
        const first = rows.find((item) => (multi || !item.has_storefront_listing) && !listedIds.has(Number(item.id)) && !chosenIds.has(Number(item.id)));
        if (first) onSelect(first);
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', keyHandler); };
  }, [chosenIds, listedIds, onClose, onSelect, open, rows, browser.loading, multi]);

  if (!open) return null;
  const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={multi ? 'Add items to set' : 'Choose Inventory Item'}>
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-6xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-lg font-bold text-slate-950">{multi ? 'Add items to set' : 'Choose Inventory Item'}</h2><p className="mt-1 text-xs text-slate-500">{multi ? `Search existing inventory and add each real item. ${chosenIds.size} selected.` : 'Search the inventory source of truth. Already-listed records cannot be selected again.'}</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close inventory picker"><X size={18} /></button>
        </div>
        <div ref={searchRef} className="border-b border-slate-200 p-4">
          <InventoryFilters query={query} update={browser.update} models={models} placeholder="Search part number, product, model, brand, color or Box…" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select value={brand} onChange={(event) => browser.update({brand:event.target.value})} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All Brands</option>{brands.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={status} onChange={(event) => browser.update({status:event.target.value})} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"><input type="checkbox" checked={inStockOnly} onChange={(event) => browser.update({in_stock_only:event.target.checked})} /> In stock only</label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {browser.loading ? <p role="status" className="p-8 text-center text-sm text-slate-600">Loading inventory…</p> : browser.error ? <p role="alert" className="p-8 text-sm text-red-700">{browser.error}</p> : rows.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><PackageSearch className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm font-semibold text-slate-700">No inventory items match</p><p className="mt-1 text-xs text-slate-500">Try a different search or clear a filter.</p></div></div> : (
            <div className="divide-y divide-slate-100">
              {rows.map((item) => {
                const listed = !multi && (item.has_storefront_listing || listedIds.has(Number(item.id)));
                const chosen = chosenIds.has(Number(item.id));
                return <div key={item.id} className="grid gap-3 px-4 py-4 hover:bg-slate-50 lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] lg:items-center">
                  <div className="flex items-start gap-3">{multi && <img src={resolveProductImageUrl(item.image)} onError={handleProductImageError} alt="" width="44" height="44" className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover" />}<div><p className="font-mono text-xs font-bold text-orange-700">{item.part_number}</p><p className="mt-1 text-sm font-semibold text-slate-950">{item.product_name || item.name}</p><p className="text-xs text-slate-500">{item.motorcycle_model || 'Model not set'} · {item.brand || 'Brand not set'} · {item.color || 'No color specified'}</p></div></div>
                  <div className="text-xs text-slate-600"><p>Box: <span className="font-semibold text-slate-800">{item.box_location || 'Not assigned'}</span></p><p>Status: <span className="font-semibold capitalize text-slate-800">{item.inventory_status}</span></p></div>
                  <div className="text-xs text-slate-600"><p>Store {money(item.store_selling_price)}</p><p className="font-semibold text-slate-900">Online {money(item.ecommerce_price)}</p></div>
                  <p className="text-xs text-slate-600"><span className="font-bold text-slate-950">{item.stock_quantity}</span> in stock</p>
                  {multi ? <button type="button" aria-pressed={chosen} onClick={() => onSelect(item)} className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${chosen ? 'border border-orange-500 bg-orange-50 text-orange-800' : 'bg-slate-950 text-white hover:bg-orange-600'}`}>
                    {chosen ? <><Check size={13} /> Added · remove</> : <><Plus size={13} /> Add to set</>}
                  </button> : <button type="button" disabled={listed} onClick={() => onSelect(item)} className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${listed ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-slate-950 text-white hover:bg-orange-600'}`}>
                    {listed ? <><Check size={13} /> Already listed</> : 'Select item'}
                  </button>}
                </div>;
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>{total} result{total === 1 ? '' : 's'}</span>
          {multi && <button type="button" onClick={onClose} className="rounded-lg bg-orange-600 px-3 py-1.5 font-semibold text-white hover:bg-orange-700">Done · {chosenIds.size} selected</button>}
          <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button></div>
        </div>
      </div>
    </div>
  );
};

export default InventoryPickerModal;
