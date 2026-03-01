import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Truck, Shield, Clock, Headphones, ChevronLeft, ChevronRight, Zap, Star } from 'lucide-react';
import { getProducts, getCategories, getBanners, getAnnouncements } from '../services/api';
import ProductCard from '../components/ProductCard';

const Home = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    getProducts().then(setProducts).catch(() => {});
    getCategories().then(setCategories).catch(() => {});
    getBanners().then(setBanners).catch(() => {});
    getAnnouncements().then(setAnnouncements).catch(() => {});

    const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    if (viewed.length > 0) setRecentlyViewed(viewed.slice(0, 6));
  }, []);

  useEffect(() => {
    if (banners.length > 1) {
      const timer = setInterval(() => setCurrentBanner(prev => (prev + 1) % banners.length), 5000);
      return () => clearInterval(timer);
    }
  }, [banners.length]);

  const featured = products.filter(p => p.is_on_sale || p.rating && p.rating >= 4).slice(0, 8);
  const bestSellers = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const newArrivals = [...products].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 4);

  return (
    <div className="min-h-screen bg-white">
      {/* Announcements Bar */}
      {announcements.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-100">
          <div className="max-w-7xl mx-auto px-4 py-2.5">
            <div className="flex items-center justify-center gap-2">
              <Zap size={14} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700 font-medium text-center">{announcements[0].title}: {announcements[0].content}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      {banners.length > 0 ? (
        <section className="relative bg-gray-900 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/90 to-transparent z-10" />
          <div className="absolute inset-0">
            <img src={banners[currentBanner]?.image_url || 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1600&h=600&fit=crop'} alt="" className="w-full h-full object-cover opacity-40 transition-opacity duration-500" />
          </div>
          <div className="relative z-20 max-w-7xl mx-auto px-4 py-16 md:py-24 lg:py-32">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold mb-4">
                <Zap size={14} /> Premium Motorcycle Parts
              </span>
              <h1 className="font-display font-bold text-3xl md:text-5xl lg:text-6xl text-white mb-4 leading-tight">
                {banners[currentBanner]?.title || <>Ride With <span className="text-orange-500">Confidence</span></>}
              </h1>
              <p className="text-gray-400 text-sm md:text-base mb-8 max-w-md leading-relaxed">
                {banners[currentBanner]?.subtitle || 'Quality motorcycle parts, accessories, and gear from trusted brands. Free shipping on orders over \u20B12,500.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to={banners[currentBanner]?.link_url || '/shop'} className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-all hover:shadow-lg hover:shadow-orange-500/20 flex items-center gap-2">
                  Shop Now <ArrowRight size={18} />
                </Link>
                <Link to="/shop?sort=newest" className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors border border-white/20">
                  New Arrivals
                </Link>
              </div>
            </div>
            {banners.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-30">
                {banners.map((_, i) => (
                  <button key={i} onClick={() => setCurrentBanner(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentBanner ? 'bg-orange-500 w-6' : 'bg-white/40 hover:bg-white/60'}`} />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="relative bg-gray-900 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/90 to-transparent z-10" />
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1600&h=600&fit=crop" alt="" className="w-full h-full object-cover opacity-40" />
          </div>
          <div className="relative z-20 max-w-7xl mx-auto px-4 py-16 md:py-24 lg:py-32">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs font-semibold mb-4">
                <Zap size={14} /> Premium Motorcycle Parts
              </span>
              <h1 className="font-display font-bold text-3xl md:text-5xl lg:text-6xl text-white mb-4 leading-tight">
                Ride With <span className="text-orange-500">Confidence</span>
              </h1>
              <p className="text-gray-400 text-sm md:text-base mb-8 max-w-md leading-relaxed">
                Quality motorcycle parts, accessories, and gear from trusted brands. Free shipping on orders over \u20B12,500.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/shop" className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-all hover:shadow-lg hover:shadow-orange-500/20 flex items-center gap-2">
                  Shop Now <ArrowRight size={18} />
                </Link>
                <Link to="/shop?sort=newest" className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors border border-white/20">
                  New Arrivals
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Trust bar */}
      <section className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Truck, label: 'Free Shipping', desc: 'Orders over â‚±2,500' },
              { icon: Shield, label: 'Authentic Parts', desc: '100% genuine products' },
              { icon: Clock, label: 'Fast Delivery', desc: '2-5 business days' },
              { icon: Headphones, label: 'Expert Support', desc: 'Mon-Sat, 9am-6pm' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <item.icon size={20} className="text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display font-bold text-2xl text-gray-900">Shop by Category</h2>
                <p className="text-sm text-gray-500 mt-1">Find the perfect parts for your ride</p>
              </div>
              <Link to="/shop" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {categories.slice(0, 8).map(cat => (
                <Link key={cat.id} to={`/shop?category=${cat.id}`} className="group flex flex-col items-center gap-2 p-4 bg-gray-50 hover:bg-orange-50 rounded-xl transition-colors text-center">
                  <div className="w-12 h-12 bg-white group-hover:bg-orange-100 rounded-lg flex items-center justify-center transition-colors shadow-sm">
                    <span className="text-lg font-bold text-gray-400 group-hover:text-orange-500 transition-colors">{cat.name.charAt(0)}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-700 group-hover:text-orange-500 transition-colors line-clamp-2">{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featured.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display font-bold text-2xl text-gray-900">Featured Products</h2>
                <p className="text-sm text-gray-500 mt-1">Hand-picked deals and top-rated parts</p>
              </div>
              <Link to="/shop" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1">
                See All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {featured.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Promo Banner */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200&h=400&fit=crop')] bg-cover bg-center opacity-10" />
            <div className="relative z-10">
              <span className="text-orange-400 text-sm font-semibold">Limited Time Offer</span>
              <h3 className="font-display font-bold text-2xl md:text-3xl text-white mt-2">Up to 30% Off Riding Gear</h3>
              <p className="text-gray-400 mt-2 text-sm">Helmets, jackets, gloves, and boots from top brands.</p>
            </div>
            <Link to="/shop?sale=true" className="relative z-10 px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors shrink-0 flex items-center gap-2">
              Shop the Sale <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Best Sellers */}
      {bestSellers.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display font-bold text-2xl text-gray-900">Best Sellers</h2>
                <p className="text-sm text-gray-500 mt-1">Most popular products from our shop</p>
              </div>
              <Link to="/shop?sort=best-selling" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {bestSellers.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* New Arrivals Grid */}
      {newArrivals.length > 0 && (
        <section className="py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display font-bold text-2xl text-gray-900">New Arrivals</h2>
                <p className="text-sm text-gray-500 mt-1">Fresh stock just landed</p>
              </div>
              <Link to="/shop?sort=newest" className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {newArrivals.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="font-display font-bold text-2xl text-gray-900 mb-8">Recently Viewed</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {recentlyViewed.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;
