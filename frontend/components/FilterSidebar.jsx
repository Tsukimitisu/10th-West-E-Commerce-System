import React from 'react';
import { X, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';

const FilterSidebar = ({
  categories, selectedCategory, onCategoryChange,
  selectedBrand, onBrandChange, brands,
  priceRange, onPriceChange,
  inStockOnly, onStockChange,
  onClearAll, activeFilterCount,
  isMobileOpen, onMobileClose
}) => {
  const [openSections, setOpenSections] = React.useState({ category: true, brand: true, price: true, stock: true });

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const content = (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-gray-600" />
          <span className="font-display font-semibold text-gray-900">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeFilterCount}</span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button onClick={onClearAll} className="text-xs text-orange-500 hover:text-orange-600 font-medium">Clear All</button>
        )}
        {onMobileClose && (
          <button onClick={onMobileClose} className="p-1 text-gray-400 hover:text-gray-600 lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Category */}
      <FilterSection title="Category" open={openSections.category} onToggle={() => toggleSection('category')}>
        <div className="space-y-1">
          <button
            onClick={() => onCategoryChange('')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategory ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            All Categories
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(String(cat.id))}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === String(cat.id) ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Brand */}
      {brands.length > 0 && (
        <FilterSection title="Brand" open={openSections.brand} onToggle={() => toggleSection('brand')}>
          <div className="space-y-1">
            <button
              onClick={() => onBrandChange('')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedBrand ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              All Brands
            </button>
            {brands.map(brand => (
              <button
                key={brand}
                onClick={() => onBrandChange(brand)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedBrand === brand ? 'bg-orange-50 text-orange-500 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {brand}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Price Range */}
      <FilterSection title="Price Range" open={openSections.price} onToggle={() => toggleSection('price')}>
        <div className="px-2 space-y-3">
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Min (₱)</label>
              <input
                type="number" min={0} value={priceRange[0]}
                onChange={e => onPriceChange([Number(e.target.value), priceRange[1]])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Max (₱)</label>
              <input
                type="number" min={0} value={priceRange[1]}
                onChange={e => onPriceChange([priceRange[0], Number(e.target.value)])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </FilterSection>

      {/* Stock */}
      <FilterSection title="Availability" open={openSections.stock} onToggle={() => toggleSection('stock')}>
        <label className="flex items-center gap-3 px-2 cursor-pointer">
          <input
            type="checkbox" checked={inStockOnly} onChange={e => onStockChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-gray-600">In stock only</span>
        </label>
      </FilterSection>
    </div>
  );

  // Mobile overlay
  if (isMobileOpen !== undefined) {
    return (
      <>
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white border border-gray-100 rounded-xl p-4 sticky top-24">{content}</div>
        </div>
        {/* Mobile overlay */}
        {isMobileOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl p-4 overflow-y-auto animate-fade-in">
              {content}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      {content}
    </div>
  );
};

const FilterSection = ({ title, open, onToggle, children }) => (
  <div className="border-b border-gray-50 pb-3">
    <button onClick={onToggle} className="flex items-center justify-between w-full py-2.5 text-sm font-semibold text-gray-900">
      {title}
      {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
    {open && <div className="pb-1">{children}</div>}
  </div>
);

export default FilterSidebar;
