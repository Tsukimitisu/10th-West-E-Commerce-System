import React, { useState } from 'react';
import { LoaderCircle, PackageSearch } from 'lucide-react';
import InventoryFilters from '../../components/operations/InventoryFilters.jsx';
import { useInventoryBrowser,useInventoryModels } from '../../hooks/useInventoryBrowser.js';
import PageHeader from '../../components/operations/PageHeader';
import { getInventoryProductItems } from '../../services/api';
import { formatItemLocation, formatItemPrice, itemStockLabel } from '../../utils/inventoryProductItems';

const PAGE_SIZE = 20;
const initialFilters = { partNumber: '', itemName: '', color: '', brand: '', motorcycleModel: '', category: '', location: '', stockStatus: '' };
const filterFields = [
  ['partNumber', 'Part number'], ['itemName', 'Item name'], ['color', 'Color'],
  ['brand', 'Brand'], ['category', 'Category'], ['location', 'Box / location'],
];

const InventoryProductItemsView = () => {
  const browser = useInventoryBrowser(getInventoryProductItems,initialFilters);
  const models = useInventoryModels();
  const {query,result,loading,error} = browser;
  const filters = query,page = query.page;
  const [filtersOpen,setFiltersOpen] = useState(false);
  const updateFilter = (key,value) => browser.update({[key]:value});
  const setPage = value => browser.update({page:typeof value==='function' ? value(page) : value});
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
        <InventoryFilters query={query} update={browser.update} models={models}>
          <button type="button" onClick={() => setFiltersOpen(open=>!open)} aria-expanded={filtersOpen} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{filtersOpen ? 'Hide filters' : 'Show filters'}</button>
        </InventoryFilters>
        {filtersOpen && (
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {filterFields.map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-slate-600">{label}
                <input type="text" value={filters[key]} onChange={(event) => updateFilter(key, event.target.value)}
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800 focus:border-orange-500 focus:outline-none" />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-600"><LoaderCircle className="animate-spin text-orange-600" size={20} /> Loading product items...</div>
        ) : error ? (
          <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
            <p>Unable to load product items. Please try again.</p>
            <button type="button" onClick={browser.refresh} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><PackageSearch size={34} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No product items found.</p></div>
        ) : (
          <div tabIndex={0} className="overflow-x-auto">
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
