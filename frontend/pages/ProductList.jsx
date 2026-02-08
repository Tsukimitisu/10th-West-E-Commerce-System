import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Grid3X3, List, SlidersHorizontal, ChevronRight, Search, X } from 'lucide-react';
import { getProducts, getCategories } from '../services/api';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';

const ProductList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
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
    const cat = searchParams.get('category');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort');
    if (cat) setSelectedCategory(cat);
    if (search) setSearchQuery(search);
    if (sort) setSortBy(sort);
  }, [searchParams]);

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

  const categoryName = categories.find(c => String(c.id) === selectedCategory)?.name;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb & Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link to="/" className="hover:text-red-600 transition-colors">Home</Link>
            <ChevronRight size={14} />
            <span className="text-gray-900 font-medium">{categoryName || 'Shop'}</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-display font-bold text-2xl text-gray-900">{categoryName || 'All Products'}</h1>
              <p className="text-sm text-gray-500 mt-1">{filtered.length} product{filtered.length !== 1 ? 's' : ''} found</p>
            </div>
            {/* Search & Controls */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 hidden md:block"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="best-selling">Best Selling</option>
                <option value="top-rated">Top Rated</option>
              </select>
              <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setView('grid')} className={`p-2 ${view === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}><Grid3X3 size={18} /></button>
                <button onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}><List size={18} /></button>
              </div>
              <button onClick={() => setMobileFiltersOpen(true)} className="lg:hidden p-2 border border-gray-200 rounded-lg text-gray-600 relative">
                <SlidersHorizontal size={18} />
                {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
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
          />

          {/* Products */}
          <div className="flex-1 min-w-0">
            {/* Mobile sort */}
            <div className="lg:hidden mb-4">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              >
                <option value="newest">Sort: Newest</option>
                <option value="price-asc">Sort: Price Low to High</option>
                <option value="price-desc">Sort: Price High to Low</option>
                <option value="best-selling">Sort: Best Selling</option>
                <option value="top-rated">Sort: Top Rated</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={32} className="text-gray-300" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">No products found</h3>
                <p className="text-sm text-gray-500 mb-4">Try adjusting your filters or search query.</p>
                <button onClick={clearAllFilters} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Clear All Filters
                </button>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(p => <ProductCard key={p.id} product={p} view="grid" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => <ProductCard key={p.id} product={p} view="list" />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductList;
