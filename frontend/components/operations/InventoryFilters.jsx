import React from 'react';
import { SearchField } from './FilterBar.jsx';

export default function InventoryFilters({query,update,models,children,placeholder='Search part number, name, model, brand, color, or Box'}) {
  const field='min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm sm:flex-none';
  const filterKeys = Object.keys(query).filter(key=>!['page','pageSize','sortBy','sortDir'].includes(key));
  return <div className="inventory-toolbar">
    <SearchField value={query.q} onChange={event=>update({q:event.target.value})} placeholder={placeholder} className="w-full sm:max-w-md" />
    <select aria-label="Filter inventory by stock" value={query.stockStatus} onChange={event=>update({stockStatus:event.target.value})} className={field}>
      <option value="">All stock</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option>
    </select>
    <select aria-label="Filter inventory by model" value={query.model_id} onChange={event=>update({model_id:event.target.value})} className={field}>
      <option value="">All models</option>{models.map(model=><option key={model.id} value={model.id}>{model.model_name}{model.brand ? ` (${model.brand})` : ''}</option>)}
    </select>
    <select aria-label="Sort inventory" value={query.sortBy} onChange={event=>update({sortBy:event.target.value})} className={field}>
      <option value="itemName">Item name</option><option value="partNumber">Part number</option><option value="motorcycleModel">Model</option><option value="location">Box location</option><option value="stockQuantity">Available stock</option><option value="price">Store price</option>
    </select>
    <select aria-label="Sort direction" value={query.sortDir} onChange={event=>update({sortDir:event.target.value})} className={field}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
    {filterKeys.some(key=>Boolean(query[key])) && <button type="button" onClick={()=>update(Object.fromEntries(filterKeys.map(key=>[key,''])))} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-orange-700 hover:bg-orange-50">Clear filters</button>}
    {children}
  </div>;
}
