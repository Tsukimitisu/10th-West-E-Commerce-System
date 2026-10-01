import React, { useEffect, useState } from 'react';
import { LoaderCircle, PackageSearch, Search } from 'lucide-react';
import PageHeader from '../../components/operations/PageHeader';
import { getInventoryProductItems } from '../../services/api';
import { formatItemLocation, formatItemPrice, itemStockLabel } from '../../utils/inventoryProductItems';

const PAGE_SIZE = 20;
const initialFilters = { partNumber: '', itemName: '', color: '', brand: '', motorcycleModel: '', category: '', location: '', stockStatus: '' };
const filterFields = [
  ['partNumber', 'Part number'], ['itemName', 'Item name'], ['color', 'Color'],
  ['brand', 'Brand'], ['motorcycleModel', 'Motorcycle model'], ['category', 'Category'], ['location', 'Box / location'],
];

const InventoryProductItemsView = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState('itemName');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getInventoryProductItems({ q: debouncedSearch, ...filters, page, pageSize: PAGE_SIZE, sortBy, sortDir })
      .then((data) => { if (active) setResult(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedSearch, filters, page, retry, sortBy, sortDir]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const items = Array.isArray(result.items) ? result.items : [];
  const total = Number(result.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Inventory reference" title="Product Items"
        description="Browse inventory items and check part numbers, prices, colors, and storage locations." />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="product-items-search" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Search inventory</label>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id="product-items-search" type="search" value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search item name, part number, color, brand, model, or box/location"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Sort by
            <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }} className="h-10 min-w-36 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
              <option value="itemName">Item Name</option><option value="partNumber">Part Number</option>
              <option value="price">Price</option><option value="stockQuantity">Stock</option><option value="location">Box / Location</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Direction
            <select value={sortDir} onChange={(event) => { setSortDir(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
              <option value="asc">Ascending</option><option value="desc">Descending</option>
            </select>
          </label>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {filtersOpen ? 'Hide filters' : 'Show filters'}
          </button>
        </div>
        {filtersOpen && (
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {filterFields.map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-slate-600">{label}
                <input type="text" value={filters[key]} onChange={(event) => updateFilter(key, event.target.value)}
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800 focus:border-orange-500 focus:outline-none" />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Stock status
              <select value={filters.stockStatus} onChange={(event) => updateFilter('stockStatus', event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
                <option value="">All stock</option><option value="in_stock">In stock</option>
                <option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option>
              </select>
            </label>
            <button type="button" onClick={() => { setFilters(initialFilters); setPage(1); }} className="self-end justify-self-start rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50">Clear filters</button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-600"><LoaderCircle className="animate-spin text-orange-600" size={20} /> Loading product items...</div>
        ) : error ? (
          <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
            <p>Unable to load product items. Please try again.</p>
            <button type="button" onClick={() => setRetry((count) => count + 1)} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><PackageSearch size={34} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No product items found.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>
                <th scope="col" className="px-4 py-3">Part Number</th><th scope="col" className="px-4 py-3">Item Name</th>
                <th scope="col" className="px-4 py-3">Color</th><th scope="col" className="px-4 py-3">Price</th>
                <th scope="col" className="px-4 py-3">Stock</th><th scope="col" className="px-4 py-3">Box / Location</th>
                <th scope="col" className="px-4 py-3">Brand / Model</th><th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const stockLabel = itemStockLabel(item);
                  return <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{item.partNumber || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.itemName}</td>
                    <td className="px-4 py-3 text-slate-700">{item.color || '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{formatItemPrice(item.price)}</td>
                    <td className="px-4 py-3"><span className="font-semibold tabular-nums text-slate-900">{item.stockQuantity}</span><span className={`ml-2 text-xs ${stockLabel === 'Out of stock' ? 'text-red-700' : stockLabel === 'Low stock' ? 'text-amber-700' : 'text-emerald-700'}`}>{stockLabel}</span></td>
                    <td className="px-4 py-3 font-bold text-orange-800">{formatItemLocation(item)}</td>
                    <td className="px-4 py-3 text-slate-700">{[item.brand, item.motorcycleModel].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{item.category || '—'}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{item.status || '—'}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>{loading || error ? 'Product items' : `${start}–${end} of ${total} product items`}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryProductItemsView;
