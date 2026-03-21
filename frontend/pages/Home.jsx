import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Truck, Shield, Wrench, Search, Zap, ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon, X, Settings, Clock, Headphones } from 'lucide-react';
import { getProducts, getCategories, getBanners, getAnnouncements, getWishlist, getSystemSettings } from '../services/api';
import ProductCard from '../components/ProductCard';

const Home = () => {
  // --- Data & API State ---
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const[announcements, setAnnouncements] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [heroConfig, setHeroConfig] = useState({
    autoplay: true,
    intervalMs: 5000,
    showDots: true,
    showArrows: true,
    pauseOnHover: true,
  });
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  
  // --- UI State ---
  const[isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // --- Data Fetching ---
  useEffect(() => {
    getProducts().then(setProducts).catch(() => { });
    getCategories().then(setCategories).catch(() => { });
    getBanners().then(setBanners).catch(() => { });
    getAnnouncements().then(setAnnouncements).catch(() => { });
    getSystemSettings('home').then((rows) => {
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        map[row.key] = row.value;
      });

      const toBool = (value, fallback) => {
        if (value === undefined || value === null) return fallback;
        return String(value) === 'true';
      };
      const parsedInterval = Number(map.hero_interval_ms);

      setHeroConfig({
        autoplay: toBool(map.hero_autoplay, true),
        intervalMs: Number.isFinite(parsedInterval) && parsedInterval >= 2000 ? parsedInterval : 5000,
        showDots: toBool(map.hero_show_dots, true),
        showArrows: toBool(map.hero_show_arrows, true),
        pauseOnHover: toBool(map.hero_pause_on_hover, true),
      });
    }).catch(() => { });

    const loadWishlist = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
        if (!user?.id) return;
        const wishlist = await getWishlist(user.id);
        setWishlistedIds(wishlist.map(item => Number(item.product_id ?? item.product?.id ?? item.id)).filter(Boolean));
      } catch (error) {
        console.error("Failed to load wishlist", error);
      }
    };

    loadWishlist();
  },[]);

  // Update real-time viewed items
  useEffect(() => {
    const handleStorageChange = () => {
      const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      setRecentlyViewed(viewed.slice(0, 6));
    };

    // Initial load
    handleStorageChange();

    window.addEventListener('recentlyViewedUpdated', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('recentlyViewedUpdated', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const activeBanners = banners
    .filter((banner) => banner?.is_active !== false)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  useEffect(() => {
    if (currentBanner >= activeBanners.length && activeBanners.length > 0) {
      setCurrentBanner(0);
    }
  }, [activeBanners.length, currentBanner]);

  // --- Wishlist Logic ---
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

  // --- Banner Rotation ---
  useEffect(() => {
    if (heroConfig.autoplay && !isHeroPaused && activeBanners.length > 1) {
      const timer = setInterval(() => setCurrentBanner(prev => (prev + 1) % activeBanners.length), heroConfig.intervalMs);
      return () => clearInterval(timer);
    }
  }, [activeBanners.length, heroConfig.autoplay, heroConfig.intervalMs, isHeroPaused]);

  const goToPrevBanner = () => {
    if (activeBanners.length <= 1) return;
    setCurrentBanner(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const goToNextBanner = () => {
    if (activeBanners.length <= 1) return;
    setCurrentBanner(prev => (prev + 1) % activeBanners.length);
  };

  // --- Derived Product Lists ---
  const featured = products.filter(p => p.is_on_sale || (p.rating && p.rating >= 4)).slice(0, 8);
  const bestSellers = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const newArrivals = [...products].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 4);

  // --- Animation Variants (Framer Motion v11 Compatible) ---
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
  };

  const sidebarVariants = {
    closed: { x: "-100%", opacity: 0 },
    open: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 100, damping: 20 } }
  };

  const buttonVariants = {
    rest: { scale: 1, skewX: -10 },   
    hover: { scale: 1.05, skewX: 0 }, 
    tap: { scale: 0.95 },             
  };

  return (
    <div className="min-h-screen bg-gray-900 font-sans overflow-x-hidden text-white relative">
      
      {/* 1. FLOATING TOGGLE BUTTON */}
      <div className="fixed sm:top-1/2 bottom-6 right-4 sm:right-auto sm:left-0 z-40 transform sm:-translate-y-1/2 flex justify-center">
        {!isSidebarOpen && (
          <motion.button
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            onClick={() => setIsSidebarOpen(true)}
            className="flex flex-row sm:flex-col items-center justify-center gap-2 bg-red-600 text-white py-3 px-4 sm:py-4 sm:px-2 rounded-full sm:rounded-r-lg sm:rounded-l-none shadow-2xl hover:bg-red-700 transition-colors cursor-pointer"
            style={{ position: 'relative' }}
          >
            <Settings size={20} className="sm:rotate-90" />
            <span 
              className="font-bold uppercase tracking-widest text-sm whitespace-nowrap block [writing-mode:horizontal-tb] sm:[writing-mode:vertical-rl] sm:[text-orientation:mixed]"
            >
              Find Parts
            </span>
          </motion.button>
        )}
      </div>

      {/* 2. SIDEBAR DRAWER */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 z-[60]"
            />
            
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={sidebarVariants}
              className="fixed top-0 left-0 h-full w-[320px] bg-zinc-900 text-white shadow-2xl z-[70] p-6 flex flex-col overflow-y-auto border-r-4 border-red-600"
            >
              <div className="flex justify-between items-center mb-8 shrink-0">
                <h3 className="text-xl font-black italic uppercase">My Garage</h3>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Select Brand</label>
                  <select className="w-full p-3 bg-zinc-800 rounded border border-zinc-700 text-white font-bold focus:ring-2 focus:ring-red-600 outline-none">
                    <option>Honda</option>
                    <option>Yamaha</option>
                    <option>Kawasaki</option>
                    <option>Suzuki</option>
                    <option>Ducati</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Select Model</label>
                  <select className="w-full p-3 bg-zinc-800 rounded border border-zinc-700 text-white font-bold focus:ring-2 focus:ring-red-600 outline-none">
                    <option>Select Model</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Year</label>
                  <select className="w-full p-3 bg-zinc-800 rounded border border-zinc-700 text-white font-bold focus:ring-2 focus:ring-red-600 outline-none">
                    <option>2024</option>
                    <option>2023</option>
                    <option>2022</option>
                  </select>
                </div>

                <div className="relative mt-6">
                  <input
                    type="text"
                    placeholder="Search parts..."
                    className="w-full p-3.5 bg-gray-800/70 border border-red-400/30 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:bg-gray-800 transition-all duration-200 hover:border-red-400/50 text-sm pl-10"
                  />
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-orange-400 hover:text-orange-300 transition-colors duration-200 cursor-pointer"
                  >
                    <Search size={18} />
                  </motion.button>
                </div>
                
                <div className="mt-8 pt-8 border-t border-zinc-800">
                  <p className="text-xs text-gray-400 mb-4">Popular Searches:</p>
                  <div className="flex flex-wrap gap-2">
                      {['Brakes', 'Exhaust', 'Tires', 'Oil'].map(tag => (
                          <span key={tag} className="px-3 py-1 bg-zinc-800 text-xs rounded-full text-gray-300 hover:text-white hover:bg-zinc-700 cursor-pointer">{tag}</span>
                      ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- HERO SECTION (Dynamic from API + Red/Zinc Styling) --- */}
      <section
        className="relative h-[600px] md:h-[700px] bg-zinc-900 flex items-center z-10"
        onMouseEnter={() => {
          if (heroConfig.pauseOnHover) setIsHeroPaused(true);
        }}
        onMouseLeave={() => {
          if (heroConfig.pauseOnHover) setIsHeroPaused(false);
        }}
        onTouchStart={(e) => setTouchStartX(e.changedTouches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStartX === null || activeBanners.length <= 1) return;
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          if (Math.abs(deltaX) > 40) {
            if (deltaX > 0) goToPrevBanner();
            else goToNextBanner();
          }
          setTouchStartX(null);
        }}
      >
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img 
            src={activeBanners.length > 0 ? activeBanners[currentBanner]?.image_url : "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=2070&auto=format&fit=crop"} 
            alt="Hero Banner" 
            className="w-full h-full object-cover opacity-60 transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10 w-full">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="h-1 w-12 bg-red-600"></span>
              <span className="text-red-500 font-bold tracking-widest uppercase text-sm">
                <Zap size={14} className="inline mr-1" /> Professional Grade Parts
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white italic uppercase leading-none mb-6">
              {activeBanners.length > 0 && activeBanners[currentBanner]?.title ? (
                activeBanners[currentBanner]?.title
              ) : (
                <>Upgrade <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-400">Your Ride</span></>
              )}
            </h1>
            <p className="text-gray-300 text-lg mb-8 max-w-lg">
              {activeBanners.length > 0 && activeBanners[currentBanner]?.subtitle 
                ? activeBanners[currentBanner]?.subtitle 
                : 'High-performance parts for street, track, and off-road. Genuine components and aftermarket upgrades delivered to your door.'}
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link to={activeBanners[currentBanner]?.link_url || '/shop'}>
                <motion.button
                  variants={buttonVariants}
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                  className="px-8 py-4 bg-red-600 text-white font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
                >
                  <span className="block skew-x-[10deg] flex items-center gap-2">
                    {activeBanners[currentBanner]?.button_text || 'Shop Parts'} <ArrowRight size={18} />
                  </span>
                </motion.button>
              </Link>
              <Link to="/shop?sort=newest">
                 <motion.button 
                   variants={buttonVariants}
                   initial="rest"
                   whileHover="hover"
                   className="px-8 py-4 border border-white/30 text-white font-bold uppercase tracking-wider skew-x-[-10deg] hover:bg-white/10 transition-colors"
                 >
                   <span className="block skew-x-[10deg]">New Arrivals</span>
                 </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>

        {heroConfig.showArrows && activeBanners.length > 1 && (
          <>
            <button
              type="button"
              onClick={goToPrevBanner}
              className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 h-10 w-10 md:h-12 md:w-12 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors flex items-center justify-center"
              aria-label="Previous banner"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={goToNextBanner}
              className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 h-10 w-10 md:h-12 md:w-12 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors flex items-center justify-center"
              aria-label="Next banner"
            >
              <ChevronRightIcon size={20} />
            </button>
          </>
        )}
        
        {/* Banner Dots from Main logic */}
        {heroConfig.showDots && activeBanners.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {activeBanners.map((_, i) => (
              <button key={i} onClick={() => setCurrentBanner(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentBanner ? 'bg-red-600 w-6' : 'bg-white/40 hover:bg-white/60'}`} />
            ))}
          </div>
        )}
      </section>

      {/* --- SERVICE STRIP --- */}
      <div className="bg-zinc-100 py-12 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Truck, title: "Fast Shipping", sub: "Orders over ₱2,500" },
              { icon: Shield, title: "Genuine Parts", sub: "100% Authentic" },
              { icon: Wrench, title: "Fitment Check", sub: "Guaranteed to fit" },
              { icon: Headphones, title: "Expert Support", sub: "Mon-Sat, 9am-6pm" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-red-600 shadow-sm">
                  <item.icon size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-white uppercase text-sm">{item.title}</h3>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- CATEGORIES --- */}
      {categories.length > 0 && (
        <section className="py-16 md:py-24 bg-gray-800">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl md:text-4xl font-black uppercase italic text-white">Shop By <span className="text-red-600">Category</span></h2>
                <div className="h-1 w-20 bg-red-600 mt-2 skew-x-[-20deg]"></div>
              </div>
              <Link to="/shop" className="hidden md:flex items-center gap-2 font-bold hover:text-red-600 transition-colors">
                View All Categories <ArrowRight size={20} />
              </Link>
            </div>

            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
            >
              {categories.slice(0, 6).map((cat) => (
                <motion.div 
                  key={cat.id} 
                  variants={fadeIn}
                  whileHover={{ y: -5 }}
                  className="group relative h-40 bg-zinc-50 border border-gray-700 rounded overflow-hidden hover:border-red-600 transition-colors cursor-pointer"
                >
                  <Link to={`/shop?category=${cat.id}`} className="block h-full w-full p-4 flex flex-col justify-between">
                    <div className="self-end p-2 bg-gray-800 rounded-full text-gray-400 group-hover:text-red-600 shadow-sm transition-colors">
                      <ChevronRight size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold uppercase text-lg leading-tight group-hover:text-red-600 transition-colors line-clamp-2">
                        {cat.name}
                      </h3>
                      <span className="text-xs text-gray-400 mt-1 block">View Parts</span>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity transform rotate-12">
                      <Wrench size={100} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* --- FEATURED PRODUCTS --- */}
      {featured.length > 0 && (
        <section className="py-16 md:py-24 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <div>
                <span className="text-red-600 font-bold uppercase tracking-widest text-sm">Hand-picked</span>
                <h2 className="text-3xl md:text-4xl font-black uppercase italic text-white mt-2">Featured Products</h2>
              </div>
              <Link to="/shop" className="text-sm font-bold text-white hover:text-red-600 flex items-center gap-1 transition-colors">
                See All <ArrowRight size={16} />
              </Link>
            </div>
            
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {featured.map(p => (
                <motion.div key={p.id} variants={fadeIn} className="bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-700 hover:shadow-xl transition-shadow">
                  <ProductCard product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* --- PROMO BANNER --- */}
      <section className="py-12 md:py-16 bg-gray-900 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border-l-8 border-red-600 rounded-r-2xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200&h=400&fit=crop')] bg-cover bg-center opacity-10" />
            <div className="relative z-10">
              <span className="text-red-500 font-bold tracking-widest uppercase text-sm">Limited Time Offer</span>
              <h3 className="font-black text-2xl md:text-4xl italic uppercase text-white mt-2">Up to 30% Off Riding Gear</h3>
              <p className="text-gray-400 mt-2 font-medium">Helmets, jackets, gloves, and boots from top brands.</p>
            </div>
            <Link to="/shop?sale=true" className="relative z-10 px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider rounded transition-colors shrink-0 flex items-center gap-2 skew-x-[-10deg]">
               <span className="block skew-x-[10deg] flex items-center gap-2">Shop the Sale <ArrowRight size={18} /></span>
            </Link>
          </div>
        </div>
      </section>

      {/* --- BEST SELLERS --- */}
      {bestSellers.length > 0 && (
        <section className="py-16 md:py-24 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <span className="text-red-600 font-bold uppercase tracking-widest text-sm">Top Rated</span>
              <h2 className="text-3xl md:text-4xl font-black uppercase text-white mt-2">Best Sellers</h2>
              <div className="w-24 h-1 bg-red-600 mx-auto mt-4 skew-x-[-20deg]"></div>
            </div>
            
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {bestSellers.map(p => (
                <motion.div key={p.id} variants={fadeIn} className="bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-700 hover:shadow-xl transition-shadow">
                  <ProductCard product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* --- NEW ARRIVALS --- */}
      {newArrivals.length > 0 && (
        <section className="py-16 bg-zinc-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
          
          <div className="max-w-7xl mx-auto px-4 relative z-10">
            <div className="flex flex-col md:flex-row gap-10 items-center">
              <div className="md:w-1/4">
                <span className="text-red-500 font-bold tracking-widest text-sm uppercase">Just Landed</span>
                <h2 className="text-4xl font-black italic uppercase mt-2 mb-4">New <br/>Arrivals</h2>
                <p className="text-gray-400 text-sm mb-6">Check out the latest performance parts and accessories added to our catalog.</p>
                <Link to="/shop?sort=newest" className="inline-flex items-center gap-2 text-white border-b-2 border-red-600 pb-1 hover:text-red-500 transition-colors">
                  Shop All New Items <ArrowRight size={16}/>
                </Link>
              </div>
              
              <div className="md:w-3/4 w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {newArrivals.map((p) => (
                    <div key={p.id} className="bg-gray-800 rounded p-3 text-white">
                      <ProductCard product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --- RECENTLY VIEWED --- */}
      {recentlyViewed.length > 0 && (
        <section className="py-16 bg-gray-800 border-t border-gray-700">
          <div className="max-w-7xl mx-auto px-4">
            <div className="mb-10">
              <h2 className="text-2xl font-black uppercase text-white">Recently Viewed</h2>
              <div className="h-1 w-16 bg-red-600 mt-2 skew-x-[-20deg]"></div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {recentlyViewed.map(p => (
                <div key={p.id} className="bg-gray-900 rounded p-3 shadow-sm border border-gray-700">
                  <ProductCard product={p} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;

