import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Grid3X3, List, Search, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { getProducts, getCategories, getWishlist, WISHLIST_SYNC_EVENT } from '../services/api';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import { getCurrentAuthUser, subscribeAuthChanges } from '../services/authSession.js';
import BrandButton from '../components/ui/BrandButton';
import EmptyState from '../components/ui/EmptyState';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';

const tokenizeSearchTerms = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim();

  if (!normalized) return [];

  const seen = new Set();
  const terms = [];
  normalized.split(/\s+/).forEach((term) => {
    if (!term || term.length < 2 || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms.slice(0, 8);
};

const normalizeSearchPhrase = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildProductSearchableText = (product) => {
  const tagText = Array.isArray(product?.tags)
    ? product.tags.join(' ')
    : String(product?.tags || '');
  const keywordText = Array.isArray(product?.keywords)
    ? product.keywords.join(' ')
    : String(product?.keywords || '');

  return [
    product?.name,
    product?.description,
    product?.category_name,
    product?.brand,
    ...(Array.isArray(product?.fitments) ? product.fitments.map((fitment) => `${fitment.brand} ${fitment.model} ${fitment.start_year || ''} ${fitment.end_year || ''}`) : []),
    product?.sku,
    product?.part_number,
    product?.partNumber,
    tagText,
    keywordText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const getProductSearchScore = (product, searchTerms, searchPhrase) => {
  const name = String(product?.name || '').toLowerCase();
  const partNumber = String(product?.part_number || product?.partNumber || '').toLowerCase();
  const brand = String(product?.brand || '').toLowerCase();
  const sku = String(product?.sku || '').toLowerCase();
  const category = String(product?.category_name || '').toLowerCase();
  const description = String(product?.description || '').toLowerCase();
  const tags = Array.isArray(product?.tags)
    ? product.tags.join(' ').toLowerCase()
    : String(product?.tags || '').toLowerCase();
  const keywords = Array.isArray(product?.keywords)
    ? product.keywords.join(' ').toLowerCase()
    : String(product?.keywords || '').toLowerCase();

  let score = 0;

  if (searchPhrase) {
    if (name === searchPhrase) score += 250;
    if (name.startsWith(searchPhrase)) score += 170;
    if (name.includes(searchPhrase)) score += 120;
    if (partNumber === searchPhrase) score += 180;
    if (partNumber.includes(searchPhrase)) score += 110;
    if (tags.includes(searchPhrase) || keywords.includes(searchPhrase)) score += 120;
  }

  searchTerms.forEach((term) => {
    if (name === term) score += 120;
    if (name.startsWith(term)) score += 60;
    if (name.includes(term)) score += 36;
    if (partNumber.startsWith(term)) score += 32;
    if (partNumber.includes(term)) score += 24;
    if (sku.includes(term)) score += 20;
    if (brand.includes(term)) score += 16;
    if (category.includes(term)) score += 14;
    if (tags.includes(term) || keywords.includes(term)) score += 40;
    if (description.includes(term)) score += 8;
  });

  return score;
};

const ProductList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRequest, setCatalogRequest] = useState(0);
  const [wishlistedIds, setWishlistedIds] = useState([]);
  const [view, setView] = useState(searchParams.get('view') === 'list' ? 'list' : 'grid');
  const [showDesktopFilters, setShowDesktopFilters] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchParams.get('search') || '');
  const [searchSettling, setSearchSettling] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || (searchParams.get('search') ? 'relevance' : 'newest'));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCatalogError(false);

    Promise.allSettled([getProducts(), getCategories()])
      .then(([productResult, categoryResult]) => {
        if (!active) return;
        if (productResult.status === 'fulfilled') {
          setProducts(productResult.value || []);
        } else {
          setProducts([]);
          setCatalogError(true);
        }
        setCategories(categoryResult.status === 'fulfilled' ? categoryResult.value || [] : []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [catalogRequest]);

  useEffect(() => {
    const loadWishlist = async () => {
      try {
        const user = getCurrentAuthUser();
        if (!user?.id) {
          setWishlistedIds([]);
          return;
        }
        const wishlist = await getWishlist(user.id);
        setWishlistedIds(wishlist.map(item => Number(item.product_id ?? item.product?.id ?? item.id)).filter(Boolean));
      } catch {
        setWishlistedIds([]);
      }
    };

    loadWishlist();

    const syncWishlist = () => {
      loadWishlist();
    };

    window.addEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
    window.addEventListener('focus', syncWishlist);
    const unsubscribeAuth = subscribeAuthChanges(syncWishlist);

    return () => {
      window.removeEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
      window.removeEventListener('focus', syncWishlist);
      unsubscribeAuth();
    };
  }, []);

  const handleWishlistToggle = (productId, shouldBeWishlisted) => {
    const normalizedId = Number(productId);
    if (!normalizedId) return;

    setWishlistedIds(prev => {
      const exists = prev.includes(normalizedId);
      if (shouldBeWishlisted && !exists) return [...prev, normalizedId];
      if (!shouldBeWishlisted && exists) return prev.filter(id => id !== normalizedId);
      return prev;
    });
  };

  useEffect(() => {
    const cat = searchParams.get('category');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort');
    const viewMode = searchParams.get('view');
    setSelectedCategory(cat || '');
    setSearchQuery(search || '');
    if (sort) setSortBy(sort);
    setView(viewMode === 'list' ? 'list' : 'grid');
  }, [searchParams]);

  useEffect(() => {
    const nextSearch = String(searchQuery || '').trim();
    if (nextSearch === debouncedSearchQuery) {
      setSearchSettling(false);
      return undefined;
    }

    setSearchSettling(Boolean(nextSearch));
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(nextSearch);
      setSearchSettling(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchQuery, debouncedSearchQuery]);

  useEffect(() => {
    const openFilters = () => {
      if (window.innerWidth >= 1024) setShowDesktopFilters((prev) => !prev);
      else setMobileFiltersOpen(true);
    };
    window.addEventListener('shop:open-filters', openFilters);
    return () => window.removeEventListener('shop:open-filters', openFilters);
  }, []);

  const brands = useMemo(() => {
    const b = new Set();
    products.forEach(p => {
      if (p.brand) b.add(p.brand);
      (p.fitments || []).forEach((fitment) => { if (fitment.brand) b.add(fitment.brand); });
    });
    return Array.from(b).sort();
  }, [products]);

  useEffect(() => {
    if (searchParams.get('focus') !== 'brands' || brands.length === 0) return undefined;
    setShowDesktopFilters(true);
    if (window.innerWidth < 1024) {
      setMobileFiltersOpen(true);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      document.getElementById('brand-filter-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [brands.length, searchParams]);

  const models = useMemo(() => {
    const m = new Set();
    products.forEach((product) => {
      (product.fitments || []).forEach((fitment) => {
        if (!selectedBrand || fitment.brand === selectedBrand) {
          if (fitment.model) m.add(fitment.model);
        }
      });
    });
    return Array.from(m).sort();
  }, [products, selectedBrand]);

  const filtered = useMemo(() => {
    let result = [...products];
    const searchTerms = tokenizeSearchTerms(debouncedSearchQuery);
    const searchPhrase = normalizeSearchPhrase(debouncedSearchQuery);
    if (searchTerms.length > 0) {
      const nameMatches = result.filter((product) => {
        const name = normalizeSearchPhrase(product?.name);
        return searchTerms.every((term) => name.includes(term));
      });
      const fallbackMatches = result.filter((product) => {
        const searchable = buildProductSearchableText(product);
        return searchTerms.every((term) => searchable.includes(term));
      });
      result = nameMatches.length > 0 ? nameMatches : fallbackMatches;

      result.sort((a, b) => {
        const scoreA = getProductSearchScore(a, searchTerms, searchPhrase);
        const scoreB = getProductSearchScore(b, searchTerms, searchPhrase);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }
    if (selectedCategory) result = result.filter(p => String(p.category_id) === selectedCategory);
    if (selectedBrand || selectedModel || selectedYear) {
      const yearNumber = selectedYear ? Number(selectedYear) : null;
      result = result.filter((product) => {
        const fitments = Array.isArray(product.fitments) ? product.fitments : [];
        if (fitments.length === 0) return selectedBrand ? product.brand === selectedBrand : true;
        return fitments.some((fitment) => {
          if (selectedBrand && fitment.brand !== selectedBrand) return false;
          if (selectedModel && fitment.model !== selectedModel) return false;
          if (Number.isInteger(yearNumber)) {
            if (fitment.start_year && Number(fitment.start_year) > yearNumber) return false;
            if (fitment.end_year && Number(fitment.end_year) < yearNumber) return false;
          }
          return true;
        });
      });
    } else if (selectedBrand) result = result.filter(p => p.brand === selectedBrand);
    if (inStockOnly) result = result.filter(p => p.stock_quantity > 0);
    result = result.filter(p => {
      const price = p.is_on_sale && p.sale_price ? p.sale_price : p.price;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    switch (sortBy) {
      case 'price-asc': result.sort((a, b) => (a.sale_price || a.price) - (b.sale_price || b.price)); break;
      case 'price-desc': result.sort((a, b) => (b.sale_price || b.price) - (a.sale_price || a.price)); break;
      case 'newest': result.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()); break;
      case 'best-selling': result.sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0)); break;
      case 'top-rated': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'relevance': break;
    }
    return result;
  }, [products, debouncedSearchQuery, selectedCategory, selectedBrand, selectedModel, selectedYear, priceRange, inStockOnly, sortBy]);

  const activeFilterCount = [searchQuery.trim(), selectedCategory, selectedBrand, selectedModel, selectedYear, inStockOnly, priceRange[0] > 0 || priceRange[1] < 100000].filter(Boolean).length;

  const selectedCategoryName = categories.find((category) => String(category.id) === selectedCategory)?.name;
  const activeFilters = [
    searchQuery.trim() && { key: 'search', label: `Search: ${searchQuery.trim()}` },
    selectedCategory && { key: 'category', label: selectedCategoryName || 'Category' },
    selectedBrand && { key: 'brand', label: selectedBrand },
    selectedModel && { key: 'model', label: selectedModel },
    selectedYear && { key: 'year', label: `Year ${selectedYear}` },
    inStockOnly && { key: 'stock', label: 'In stock' },
    (priceRange[0] > 0 || priceRange[1] < 100000) && { key: 'price', label: `₱${priceRange[0].toLocaleString()}–₱${priceRange[1].toLocaleString()}` },
  ].filter(Boolean);

  const removeFilter = (key) => {
    const nextParams = new URLSearchParams(searchParams);
    if (key === 'search') { setSearchQuery(''); nextParams.delete('search'); }
    if (key === 'category') { setSelectedCategory(''); nextParams.delete('category'); }
    if (key === 'brand') { setSelectedBrand(''); setSelectedModel(''); }
    if (key === 'model') setSelectedModel('');
    if (key === 'year') setSelectedYear('');
    if (key === 'stock') setInStockOnly(false);
    if (key === 'price') setPriceRange([0, 100000]);
    nextParams.delete('focus');
    setSearchParams(nextParams, { replace: true });
  };

  const clearAllFilters = () => {
    setSelectedCategory(''); setSelectedBrand(''); setSelectedModel(''); setSelectedYear(''); setPriceRange([0, 100000]); setInStockOnly(false); setSearchQuery('');
    const nextParams = new URLSearchParams();
    if (sortBy !== 'newest') nextParams.set('sort', sortBy);
    if (view !== 'grid') nextParams.set('view', view);
    setSearchParams(nextParams, { replace: true });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-6 lg:px-8">
          <LoadingSkeleton className="h-10 w-64" />
          <LoadingSkeleton className="mt-4 h-5 w-80 max-w-full" />
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <LoadingSkeleton className="aspect-square rounded-none" />
                <div className="space-y-3 p-4">
                  <LoadingSkeleton className="h-3 w-20" />
                  <LoadingSkeleton className="h-4 w-3/4" />
                  <LoadingSkeleton className="h-5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (catalogError) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            icon={AlertTriangle}
            title="The catalog is temporarily unavailable"
            description="The product service could not be reached. Please try again in a moment."
            action={<BrandButton onClick={() => setCatalogRequest((request) => request + 1)}>Try again</BrandButton>}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,38rem)] lg:items-end lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">10th West Moto catalog</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Motorcycle parts & accessories</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Find dependable parts, riding gear, and accessories with clear fitment and stock information.</p>
          </div>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products, brands, or part numbers"
              aria-label="Search products"
              className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-11 pr-4 text-sm text-slate-950 transition placeholder:text-slate-500 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-slate-200 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'product' : 'products'}</p>
              <p className="text-xs text-slate-600">
                {searchSettling ? 'Updating results…' : activeFilterCount ? `${activeFilterCount} active filters` : 'Showing the full catalog'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 lg:hidden"
              >
                <SlidersHorizontal size={16} />
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </button>
              <button
                onClick={() => setShowDesktopFilters(prev => !prev)}
                className="hidden h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 lg:inline-flex"
              >
                {showDesktopFilters ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                {showDesktopFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                aria-label="Sort products"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
              >
                {searchQuery && <option value="relevance">Relevance</option>}
                <option value="newest">Newest</option>
                <option value="price-asc">Price Low to High</option>
                <option value="price-desc">Price High to Low</option>
                <option value="best-selling">Best Selling</option>
                <option value="top-rated">Top Rated</option>
              </select>
              <div className="hidden rounded-lg border border-slate-300 p-1 sm:flex" aria-label="Product view">
                <button type="button" onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={`grid h-8 w-8 place-items-center rounded-lg ${view === 'grid' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Grid3X3 size={15} /></button>
                <button type="button" onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={`grid h-8 w-8 place-items-center rounded-lg ${view === 'list' ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><List size={15} /></button>
              </div>
            </div>
          </div>
          {activeFilters.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {activeFilters.map((filter) => (
                <button key={filter.key} type="button" onClick={() => removeFilter(filter.key)} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-950" aria-label={`Remove ${filter.label} filter`}>
                  <span className="max-w-52 truncate">{filter.label}</span>
                  <X size={13} aria-hidden="true" />
                </button>
              ))}
              <button type="button" onClick={clearAllFilters} className="px-2 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:text-orange-900">Clear all</button>
            </div>
          )}
        </div>

        <div className="flex gap-5 xl:gap-7">
          <FilterSidebar
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedBrand={selectedBrand}
            onBrandChange={setSelectedBrand}
            brands={brands}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            models={models}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
            priceRange={priceRange}
            onPriceChange={setPriceRange}
            inStockOnly={inStockOnly}
            onStockChange={setInStockOnly}
            onClearAll={clearAllFilters}
            activeFilterCount={activeFilterCount}
            isMobileOpen={mobileFiltersOpen}
            onMobileClose={() => setMobileFiltersOpen(false)}
            showDesktop={showDesktopFilters}
            resultCount={filtered.length}
          />

          <div className="min-w-0 flex-1">
            {searchSettling ? (
              <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                <h2 className="font-semibold text-slate-950">Updating products</h2>
                <p className="mt-1 text-sm text-slate-600">Results update as you type.</p>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title={products.length === 0 ? 'No products are available yet' : 'No matching products'}
                description={products.length === 0
                  ? 'The catalog is connected, but no products have been published.'
                  : 'Try a different product name or remove one or more filters.'}
                action={products.length > 0 ? <BrandButton onClick={clearAllFilters}>Clear filters</BrandButton> : null}
              />
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 2xl:gap-5">
                {filtered.map(p => <ProductCard key={p.id} product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} view="grid" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => <ProductCard key={p.id} product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} view="list" />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default ProductList;
