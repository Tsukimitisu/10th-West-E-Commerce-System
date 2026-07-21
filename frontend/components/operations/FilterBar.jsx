import React from 'react';
import { Search } from 'lucide-react';

export const SearchField = ({ value, onChange, placeholder = 'Search…', className = '' }) => (
  <label className={`relative block min-w-0 ${className}`}>
    <span className="sr-only">{placeholder}</span>
    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="search"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
    />
  </label>
);

const FilterBar = ({ children, search, onSearchChange, searchPlaceholder, actions }) => (
  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center">
    {onSearchChange && (
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="w-full md:max-w-sm"
      />
    )}
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export default FilterBar;
