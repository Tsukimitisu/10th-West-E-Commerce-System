import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { getProducts, getCategories, getWishlist } from '../services/api';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';

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
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');

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
        if (!user?.id) return;
        const wishlist = await getWishlist(user.id);
        setWishlistedIds(wishlist.map(item => Number(item.product_id ?? item.product?.id ?? item.id)).filter(Boolean));
      } catch {}
    };

    loadWishlist();
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
    const openFilters = () => {
      if (window.innerWidth >= 1024) setShowDesktopFilters((prev) => !prev);
      else setMobileFiltersOpen(true);
    };
    window.addEventListener('shop:open-filters', openFilters);
    return () => window.removeEventListener('shop:open-filters', openFilters);
  }, []);

  const brands = useMemo(() => {
    const b = new Set();
    products.forEach(p => { if (p.brand) b.add(p.brand); });
    return Array.from(b).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let result = [...products];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category_name?.toLowerCase().includes(q));
    }
    if (selectedCategory) result = result.filter(p => String(p.category_id) === selectedCategory);
    if (selectedBrand) result = result.filter(p => p.brand === selectedBrand);
    if (inStockOnly) result = result.filter(p => p.stock_quantity > 0);
    result = result.filter(p => {
      const price = p.is_on_sale && p.sale_price ? p.sale_price : p.price;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    switch (sortBy) {
      case 'price-asc': result.sort((a, b) => (a.sale_price || a.price) - (b.sale_price || b.price)); break;
      case 'price-desc': result.sort((a, b) => (b.sale_price || b.price) - (a.sale_price || a.price)); break;
      case 'newest': result.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()); break;
      case 'best-selling': result.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0)); break;
      case 'top-rated': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    }
    return result;
  }, [products, searchQuery, selectedCategory, selectedBrand, priceRange, inStockOnly, sortBy]);

  const activeFilterCount = [selectedCategory, selectedBrand, inStockOnly, priceRange[0] > 0 || priceRange[1] < 100000].filter(Boolean).length;

  const clearAllFilters = () => {
    setSelectedCategory(''); setSelectedBrand(''); setPriceRange([0, 100000]); setInStockOnly(false); setSearchQuery('');
    setSearchParams({});
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
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
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{filtered.length} products found</p>
              <p className="text-xs text-gray-400">Use filters to narrow down your parts fast</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden h-10 px-3 rounded-xl border border-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-700 inline-flex items-center gap-2"
              >
                <SlidersHorizontal size={16} />
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </button>
              <button
                onClick={() => setShowDesktopFilters(prev => !prev)}
                className="hidden lg:inline-flex h-10 px-3 rounded-xl border border-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-700 items-center gap-2"
              >
                {showDesktopFilters ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                {showDesktopFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-10 px-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price Low to High</option>
                <option value="price-desc">Price High to Low</option>
                <option value="best-selling">Best Selling</option>
                <option value="top-rated">Top Rated</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Filter Sidebar */}
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

          {/* Products */}
          <div className="flex-1 min-w-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={32} className="text-gray-300" />
                </div>
                <h3 className="font-semibold text-white mb-2">No products found</h3>
                <p className="text-sm text-gray-400 mb-4">Try adjusting your filters or search query.</p>
                <button onClick={clearAllFilters} className="px-6 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
                  Clear All Filters
                </button>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
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


