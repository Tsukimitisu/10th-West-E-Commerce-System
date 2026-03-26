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
      const words = searchQuery.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);
      result = result.filter(p => {
        return words.every(word => {
          return (
            p.name?.toLowerCase().includes(word) || 
            p.description?.toLowerCase().includes(word) || 
            p.category_name?.toLowerCase().includes(word) ||
            p.brand?.toLowerCase().includes(word) ||
            p.sku?.toLowerCase().includes(word) ||
            p.part_number?.toLowerCase().includes(word)
          );
        });
      });
      const exactSearch = searchQuery.trim().toLowerCase();
      result.sort((a, b) => {
        let scoreA = (a.name?.toLowerCase().includes(exactSearch) ? 15 : 0) + (a.part_number?.toLowerCase() === exactSearch ? 20 : 0);
        let scoreB = (b.name?.toLowerCase().includes(exactSearch) ? 15 : 0) + (b.part_number?.toLowerCase() === exactSearch ? 20 : 0);
        return scoreB - scoreA;
      });
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
      case 'best-selling': result.sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0)); break;
      case 'top-rated': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'relevance': break;
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
    <div 
      className="min-h-screen" 
      style={{
        backgroundColor: '#f3f4f6',
        // Geometric Low-Poly Background Pattern
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 800 800'%3E%3Cg fill-opacity='0.4'%3E%3Cpath fill='%23d1d5db' d='M0 0l400 0-200 300L0 0z'/%3E%3Cpath fill='%23e5e7eb' d='M400 0l400 0-200 300-200-300z'/%3E%3Cpath fill='%239ca3af' d='M800 0l0 400-300-200 300-200z'/%3E%3Cpath fill='%23d1d5db' d='M800 400l0 400-300-200 300-200z'/%3E%3Cpath fill='%23e5e7eb' d='M800 800l-400 0 200-300 200 300z'/%3E%3Cpath fill='%23f3f4f6' d='M400 800l-400 0 200-300 200 300z'/%3E%3Cpath fill='%239ca3af' d='M0 800l0-400 300 200-300 200z'/%3E%3Cpath fill='%23d1d5db' d='M0 400l0-400 300 200-300 200z'/%3E%3Cpath fill='%23f9fafb' d='M300 200l200 0-100 200-100-200z'/%3E%3Cpath fill='%23e5e7eb' d='M500 200l0 200-200 0 200-200z'/%3E%3Cpath fill='%239ca3af' d='M500 400l-200 200 0-200 200 0z'/%3E%3Cpath fill='%23d1d5db' d='M300 400l200 200-200 0 0-200z'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundAttachment: 'fixed',
        backgroundSize: '600px', 
        backgroundRepeat: 'repeat'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl px-4 py-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{filtered.length} products found</p>
              <p className="text-xs text-gray-600">Use filters to narrow down your parts fast</p>
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

          <div className="flex-1 min-w-0 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-6 shadow-lg">
            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-white/20 backdrop-blur-sm rounded-3xl border border-white/30">
                <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={32} className="text-gray-300" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">No products found</h3>
                <p className="text-sm text-gray-600 mb-4">Try adjusting your filters or search query.</p>
                <button onClick={clearAllFilters} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg">
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