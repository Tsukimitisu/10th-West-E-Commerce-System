import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { getProducts, getCategories, getWishlist, WISHLIST_SYNC_EVENT } from '../services/api';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import ShoppableFeed from '../components/ShoppableFeed';

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
    Promise.all([getProducts(), getCategories()])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const loadWishlist = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
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
    window.addEventListener('storage', syncWishlist);
    window.addEventListener('focus', syncWishlist);

    return () => {
      window.removeEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
      window.removeEventListener('storage', syncWishlist);
      window.removeEventListener('focus', syncWishlist);
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

  const activeFilterCount = [selectedCategory, selectedBrand, selectedModel, selectedYear, inStockOnly, priceRange[0] > 0 || priceRange[1] < 100000].filter(Boolean).length;

  const clearAllFilters = () => {
    setSelectedCategory(''); setSelectedBrand(''); setSelectedModel(''); setSelectedYear(''); setPriceRange([0, 100000]); setInStockOnly(false); setSearchQuery('');
    setSearchParams({});
  };

  const pageBackgroundStyle = {
    backgroundColor: '#f8fafc',
    backgroundImage: `
      radial-gradient(circle at 8% 14%, rgba(239, 68, 68, 0.10) 0%, transparent 34%),
      radial-gradient(circle at 92% 6%, rgba(30, 41, 59, 0.08) 0%, transparent 28%),
      linear-gradient(140deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.92) 42%, rgba(226, 232, 240, 0.85) 100%)
    `,
    backgroundAttachment: 'fixed',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={pageBackgroundStyle}>
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white/20 backdrop-blur-md rounded-xl border border-white/30 overflow-hidden">
                <div className="aspect-square skeleton" />
                <div className="p-4 space-y-3">
                  <div className="h-3 skeleton rounded w-20" />
                  <div className="h-4 skeleton rounded w-3/4" />
                  <div className="h-5 skeleton rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen" 
      style={pageBackgroundStyle}
    >
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl px-4 py-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{filtered.length} products found</p>
              <p className="text-xs text-gray-600">
                {searchSettling ? 'Searching product names...' : 'Use filters to narrow down your parts fast'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden h-10 px-3 rounded-xl border border-white/30 bg-white/10 backdrop-blur text-sm font-medium text-gray-900 hover:bg-white/20 inline-flex items-center gap-2"
              >
                <SlidersHorizontal size={16} />
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </button>
              <button
                onClick={() => setShowDesktopFilters(prev => !prev)}
                className="hidden lg:inline-flex h-10 px-3 rounded-xl border border-white/30 bg-white/10 backdrop-blur text-sm font-medium text-gray-900 hover:bg-white/20 items-center gap-2"
              >
                {showDesktopFilters ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                {showDesktopFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-10 px-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-700/50"
              >
                {searchQuery && <option value="relevance">Relevance</option>}
                <option value="newest">Newest</option>
                <option value="price-asc">Price Low to High</option>
                <option value="price-desc">Price High to Low</option>
                <option value="best-selling">Best Selling</option>
                <option value="top-rated">Top Rated</option>
              </select>
            </div>
          </div>
        </div>

        <ShoppableFeed
          products={filtered.length > 0 ? filtered : products}
          wishlistedIds={wishlistedIds}
          onWishlistToggle={handleWishlistToggle}
        />

        <div className="mb-4 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl px-4 py-3 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={selectedBrand}
              onChange={(event) => {
                setSelectedBrand(event.target.value);
                setSelectedModel('');
              }}
              className="h-10 px-3 bg-white/80 border border-slate-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-700/30"
            >
              <option value="">Brand</option>
              {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-10 px-3 bg-white/80 border border-slate-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-700/30"
            >
              <option value="">Model</option>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
            <input
              type="number"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              placeholder="Year"
              min="1900"
              max="2100"
              className="h-10 px-3 bg-white/80 border border-slate-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-700/30"
            />
          </div>
        </div>

        <div className="flex gap-6">
          <FilterSidebar
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedBrand={selectedBrand}
            onBrandChange={setSelectedBrand}
            brands={brands}
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

          <div className="flex-1 min-w-0 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-3 sm:p-5 lg:p-6 shadow-lg">
            {searchSettling ? (
              <div className="text-center py-16 bg-white/20 backdrop-blur-sm rounded-3xl border border-white/30">
                <div className="w-10 h-10 border-2 border-red-500/30 border-t-red-600 rounded-full animate-spin mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">Searching products</h3>
                <p className="text-sm text-gray-600">Results update as you type.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 bg-white/20 backdrop-blur-sm rounded-3xl border border-white/30">
                <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={32} className="text-gray-300" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">No products found</h3>
                <p className="text-sm text-gray-600 mb-4">Try another product name or adjust your filters.</p>
                <button onClick={clearAllFilters} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg">
                  Clear All Filters
                </button>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] xl:grid-cols-4 gap-3 sm:gap-4">
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
    </div>
  );
};

export default ProductList;
