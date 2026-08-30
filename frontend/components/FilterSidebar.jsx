import React from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';

const INITIAL_VISIBLE_OPTIONS = 6;

const FilterSidebar = ({
  categories,
  selectedCategory,
  onCategoryChange,
  selectedBrand,
  onBrandChange,
  brands,
  selectedModel,
  onModelChange,
  models,
  selectedYear,
  onYearChange,
  priceRange,
  onPriceChange,
  inStockOnly,
  onStockChange,
  onClearAll,
  activeFilterCount,
  isMobileOpen,
  onMobileClose,
  showDesktop = true,
  resultCount,
}) => {
  const [openSections, setOpenSections] = React.useState({
    category: true,
    brand: true,
    fitment: true,
    price: true,
    stock: true,
  });
  const [showAllCategories, setShowAllCategories] = React.useState(false);
  const [showAllBrands, setShowAllBrands] = React.useState(false);

  React.useEffect(() => {
    if (isMobileOpen === undefined) return undefined;
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const toggleSection = (section) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const visibleCategories = showAllCategories ? categories : categories.slice(0, INITIAL_VISIBLE_OPTIONS);
  const visibleBrands = showAllBrands ? brands : brands.slice(0, INITIAL_VISIBLE_OPTIONS);

  const content = (
    <div className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-3 pb-5">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <SlidersHorizontal size={17} aria-hidden="true" />
            <h2 className="font-display text-base font-bold">Filters</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {activeFilterCount ? `${activeFilterCount} active` : 'Refine your results'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <button type="button" onClick={onClearAll} className="rounded-md px-2 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800">
              Clear all
            </button>
          )}
          {onMobileClose && (
            <button type="button" onClick={onMobileClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 lg:hidden" aria-label="Close filters">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <FilterSection title="Category" open={openSections.category} onToggle={() => toggleSection('category')}>
        <OptionButton selected={!selectedCategory} onClick={() => onCategoryChange('')}>All categories</OptionButton>
        {visibleCategories.map((category) => (
          <OptionButton key={category.id} selected={selectedCategory === String(category.id)} onClick={() => onCategoryChange(String(category.id))}>
            {category.name}
          </OptionButton>
        ))}
        {categories.length > INITIAL_VISIBLE_OPTIONS && (
          <ShowMoreButton expanded={showAllCategories} onClick={() => setShowAllCategories((current) => !current)} />
        )}
      </FilterSection>

      {brands.length > 0 && (
        <FilterSection title="Brand" open={openSections.brand} onToggle={() => toggleSection('brand')} sectionId="brand-filter-section">
          <OptionButton selected={!selectedBrand} onClick={() => { onBrandChange(''); onModelChange?.(''); }}>All brands</OptionButton>
          {visibleBrands.map((brand) => (
            <OptionButton key={brand} selected={selectedBrand === brand} onClick={() => { onBrandChange(brand); onModelChange?.(''); }}>
              {brand}
            </OptionButton>
          ))}
          {brands.length > INITIAL_VISIBLE_OPTIONS && (
            <ShowMoreButton expanded={showAllBrands} onClick={() => setShowAllBrands((current) => !current)} />
          )}
        </FilterSection>
      )}

      {(models?.length > 0 || selectedBrand || selectedModel || selectedYear) && (
        <FilterSection title="Motorcycle fitment" open={openSections.fitment} onToggle={() => toggleSection('fitment')}>
          <div className="space-y-2.5">
            <label className="block">
              <span className="sr-only">Motorcycle model</span>
              <select value={selectedModel || ''} onChange={(event) => onModelChange?.(event.target.value)} disabled={!models?.length} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-3 focus:ring-orange-500/10 disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">All models</option>
                {(models || []).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Model year</span>
              <input type="number" min="1950" max={new Date().getFullYear() + 1} value={selectedYear || ''} onChange={(event) => onYearChange?.(event.target.value)} placeholder="Model year" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-3 focus:ring-orange-500/10" />
            </label>
          </div>
        </FilterSection>
      )}

      <FilterSection title="Price" open={openSections.price} onToggle={() => toggleSection('price')}>
        <div className="grid grid-cols-2 gap-2">
          <PriceInput label="Minimum" value={priceRange[0]} onChange={(value) => onPriceChange([value, priceRange[1]])} />
          <PriceInput label="Maximum" value={priceRange[1]} onChange={(value) => onPriceChange([priceRange[0], value])} />
        </div>
      </FilterSection>

      <FilterSection title="Availability" open={openSections.stock} onToggle={() => toggleSection('stock')}>
        <label className="flex cursor-pointer items-center gap-3 py-1 text-sm text-slate-700">
          <span className={`grid h-5 w-5 place-items-center rounded border transition-colors ${inStockOnly ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
            <Check size={13} />
          </span>
          <input type="checkbox" checked={inStockOnly} onChange={(event) => onStockChange(event.target.checked)} className="sr-only" />
          In-stock items only
        </label>
      </FilterSection>

      {onMobileClose && (
        <div className="sticky bottom-0 -mx-5 mt-auto border-t border-slate-200 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur lg:hidden">
          <button type="button" onClick={onMobileClose} className="h-11 w-full rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition-colors hover:bg-orange-600">
            Show {resultCount ?? 0} results
          </button>
        </div>
      )}
    </div>
  );

  if (isMobileOpen !== undefined) {
    return (
      <>
        <aside className={`${showDesktop ? 'hidden lg:block' : 'hidden'} w-[280px] shrink-0 xl:w-[300px]`} aria-label="Shop filters">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain border-r border-slate-200 bg-white py-1 pr-5 [scrollbar-gutter:stable]" data-testid="shop-filter-scroll">
            {content}
          </div>
        </aside>

        {isMobileOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Product filters">
            <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] animate-fade-in" onClick={onMobileClose} aria-label="Close filters" />
            <div className="absolute inset-y-0 left-0 max-h-[88vh] w-[min(88vw,360px)] overflow-y-auto bg-white p-5 shadow-2xl animate-drawer-in">
              {content}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <aside className="max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-5 [scrollbar-gutter:stable]" data-testid="shop-filter-scroll" aria-label="Shop filters">
      {content}
    </aside>
  );
};

const FilterSection = ({ title, open, onToggle, children, sectionId }) => (
  <section id={sectionId} className="border-t border-slate-200 py-4 first:border-t-0">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between py-1 text-left text-sm font-bold text-slate-900 transition-colors hover:text-orange-700" aria-expanded={open}>
      {title}
      <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="min-h-0 space-y-1 overflow-hidden">{children}</div>
    </div>
  </section>
);

const OptionButton = ({ selected, onClick, children }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${selected ? 'bg-orange-50 font-semibold text-orange-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`} aria-pressed={selected}>
    <span className="truncate">{children}</span>
    {selected && <Check size={14} className="shrink-0 text-orange-600" />}
  </button>
);

const ShowMoreButton = ({ expanded, onClick }) => (
  <button type="button" onClick={onClick} className="px-2.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-orange-700">
    {expanded ? 'Show less' : 'Show more'}
  </button>
);

const PriceInput = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1.5 block text-[11px] font-medium text-slate-500">{label}</span>
    <span className="relative block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₱</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onKeyDown={(event) => { if (['.', ',', 'e', 'E', '-', '+'].includes(event.key)) event.preventDefault(); }}
        onChange={(event) => onChange(event.target.value === '' ? 0 : Number.parseInt(event.target.value, 10))}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-3 focus:ring-orange-500/10"
      />
    </span>
  </label>
);

export default FilterSidebar;
