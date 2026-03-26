import React from 'react';
import { X, ChevronDown, ChevronUp, SlidersHorizontal, Shapes, Tag, WalletCards, Boxes, Sparkles } from 'lucide-react';

const FilterSidebar = ({
  categories, selectedCategory, onCategoryChange,
  selectedBrand, onBrandChange, brands,
  priceRange, onPriceChange,
  inStockOnly, onStockChange,
  onClearAll, activeFilterCount,
  isMobileOpen, onMobileClose,
  showDesktop = true,
  resultCount,
}) => {
  const [openSections, setOpenSections] = React.useState({ category: true, brand: true, price: true, stock: true });

  React.useEffect(() => {
    if (isMobileOpen === undefined) return;
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const toggleSection = (section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const activePill = 'bg-red-700/80 text-white border-grey-900 shadow-sm';
  const idlePill = 'bg-white/10 text-gray-700 border-white/20 hover:border-white/40 hover:bg-white/20';

  const content = (
    <div className="space-y-4 " >
      <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center">
              <SlidersHorizontal size={16} />
            </div>
            <div>
              <p className="font-display font-semibold text-gray-900 leading-tight">Filters</p>
              <p className="text-[11px] text-gray-600">Refine your shop results</p>
            </div>
          </div>
          {onMobileClose && (
            <button onClick={onMobileClose} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white/30 lg:hidden">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-100/20 border border-red-400 text-xs text-red-700">
            <Sparkles size={12} className="text-red-500" />
            <span>{activeFilterCount} active</span>
          </div>
          <button
            onClick={onClearAll}
            disabled={activeFilterCount === 0}
            className="text-xs font-semibold text-red-700 hover:text-zinc-900 disabled:text-gray-400"
          >
            Clear all
          </button>
        </div>
      </div>

      <FilterSection
        title="Category"
        icon={<Shapes size={15} className="text-red-500" />}
        open={openSections.category}
        onToggle={() => toggleSection('category')}
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onCategoryChange('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedCategory ? activePill : idlePill}`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(String(cat.id))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedCategory === String(cat.id) ? activePill : idlePill}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </FilterSection>

      {brands.length > 0 && (
        <FilterSection
          title="Brand"
          icon={<Tag size={15} className="text-red-500" />}
          open={openSections.brand}
          onToggle={() => toggleSection('brand')}
        >
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onBrandChange('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedBrand ? activePill : idlePill}`}
            >
              All Brands
            </button>
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => onBrandChange(brand)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedBrand === brand ? activePill : idlePill}`}
              >
                {brand}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      <FilterSection
        title="Price Range"
        icon={<WalletCards size={15} className="text-red-500" />}
        open={openSections.price}
        onToggle={() => toggleSection('price')}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-600 mb-1 block">Min (PHP)</label>
              <input
                type="number"
                min={0}
                step="1"
                value={priceRange[0]}
                onKeyDown={(e) => {
                  if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  onPriceChange([val, priceRange[1]]);
                }}
                className="w-full px-3 py-2 border border-white/30 bg-white/20 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-600 mb-1 block">Max (PHP)</label>
              <input
                type="number"
                min={0}
                step="1"
                value={priceRange[1]}
                onKeyDown={(e) => {
                  if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  onPriceChange([priceRange[0], val]);
                }}
                className="w-full px-3 py-2 border border-white/30 bg-white/20 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-600">Set your ideal budget range</p>
        </div>
      </FilterSection>

      <FilterSection
        title="Availability"
        icon={<Boxes size={15} className="text-red-500" />}
        open={openSections.stock}
        onToggle={() => toggleSection('stock')}
      >
        <label className="flex items-center gap-3 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onStockChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-orange-500"
          />
          <span className="text-sm text-gray-700">Show in-stock items only</span>
        </label>
      </FilterSection>

      {onMobileClose && (
        <div className="lg:hidden sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-white/30 -mx-4 px-4 pt-3 pb-4 mt-2">
          <div className="flex gap-2">
            <button
              onClick={onClearAll}
              disabled={activeFilterCount === 0}
              className="flex-1 h-11 rounded-xl border border-white/30 bg-white/10 text-sm font-medium text-gray-900 hover:bg-white/25 disabled:text-gray-400 disabled:bg-white/5"
            >
              Reset
            </button>
            <button
              onClick={onMobileClose}
              className="flex-1 h-11 rounded-xl bg-[#f97316] text-white text-sm font-semibold hover:bg-[#ea580c]"
            >
              Show {resultCount ?? ''} Results
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (isMobileOpen !== undefined) {
    return (
      <>
        <div className={`${showDesktop ? 'hidden lg:block' : 'hidden'} w-64 flex-shrink-0`}>
          <div className="bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl p-4 sticky top-24 shadow-lg">{content}</div>
        </div>

        {isMobileOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <div className="absolute inset-0 bg-black/45" onClick={onMobileClose} />
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] bg-white/95 backdrop-blur-md rounded-t-3xl shadow-2xl p-4 overflow-y-auto animate-fade-in">
              <div className="w-10 h-1.5 rounded-full bg-gray-300 mx-auto mb-3" />
              {content}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl p-4 shadow-lg">
      {content}
    </div>
  );
};

const FilterSection = ({ title, icon, open, onToggle, children }) => (
  <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2.5">
    <button onClick={onToggle} className="flex items-center justify-between w-full py-1.5 text-sm font-semibold text-gray-900">
      <span className="inline-flex items-center gap-2">
        {icon}
        {title}
      </span>
      {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
    {open && <div className="pt-2 pb-1">{children}</div>}
  </div>
);

export default FilterSidebar;


