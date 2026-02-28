import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Truck, Shield, Wrench, Search, Zap, ChevronRight, X, Settings } from 'lucide-react';
import { getProducts, getCategories } from '../services/api';
import ProductCard from '../components/ProductCard';

const Home = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [prodData, catData] = await Promise.all([
          getProducts().catch(() => []),
          getCategories().catch(() => [])
        ]);
        setProducts(Array.isArray(prodData) ? prodData : []);
        setCategories(Array.isArray(catData) ? catData : []);
      } catch (error) {
        console.error("Error loading data", error);
      }
    };
    fetchData();

    try {
        const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        if (Array.isArray(viewed)) setRecentlyViewed(viewed.slice(0, 6));
    } catch(e) { console.log(e) }
  }, []);

  const featured = products.filter(p => p.is_on_sale || (p.rating && p.rating >= 4)).slice(0, 8);
  const bestSellers = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const newArrivals = [...products].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 4);

  // --- Animation Variants ---
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
  rest: { scale: 1, skewX: -10 },   // normal state
  hover: { scale: 1.05, skewX: 0 }, // on hover
  tap: { scale: 0.95 },             // on tap
};

  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden text-gray-900 relative">
      
      {/* 1. FLOATING TOGGLE BUTTON (Keep this separate) */}
      <div className="fixed top-1/2 left-0 z-40 transform -translate-y-1/2">
        {!isSidebarOpen && (
          <motion.button
            initial={{ x: -50 }}
            animate={{ x: 0 }}
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-2 bg-red-600 text-white py-4 px-2 rounded-r-lg shadow-2xl hover:bg-red-700 transition-colors cursor-pointer"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            <Settings size={20} className="mb-2 rotate-90" />
            <span className="font-bold uppercase tracking-widest text-sm">Find Parts</span>
          </motion.button>
        )}
      </div>

      {/* 2. SIDEBAR DRAWER (Moved OUTSIDE the transformed div above) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 z-[60]"
            />
            
            {/* Sidebar Content */}
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

                <button className="w-full py-4 bg-red-600 text-white font-bold uppercase tracking-wider hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 mt-4 flex items-center justify-center gap-2">
                  <Search size={20} /> Find Parts
                </button>
                
                <div className="mt-8 pt-8 border-t border-zinc-800">
                  <p className="text-xs text-gray-500 mb-4">Popular Searches:</p>
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

      {/* --- HERO SECTION --- */}
      <section className="relative h-[600px] md:h-[700px] bg-zinc-900 flex items-center z-10">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=2070&auto=format&fit=crop" 
            alt="Motorcycle Garage" 
            className="w-full h-full object-cover opacity-60"
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
              <span className="text-red-500 font-bold tracking-widest uppercase text-sm">Professional Grade Parts</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white italic uppercase leading-none mb-6">
              Upgrade <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-400">Your Ride</span>
            </h1>
            <p className="text-gray-300 text-lg mb-8 max-w-lg">
              High-performance parts for street, track, and off-road. 
              Genuine components and aftermarket upgrades delivered to your door.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link to="/shop">
                <motion.button
                variants={buttonVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
                className="px-8 py-4 bg-red-600 text-white font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
              >
                  <span className="block skew-x-[10deg]">Shop Parts</span>
                </motion.button>
              </Link>
              <motion.button 
                variants={buttonVariants}
                initial="rest"
                whileHover="hover"
                onClick={() => setIsSidebarOpen(true)}
                className="px-8 py-4 border border-white/30 text-white font-bold uppercase tracking-wider skew-x-[-10deg] hover:bg-white/10 transition-colors"
              >
                
                <span className="block skew-x-[10deg]">Filter By Bike</span>
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- SERVICE STRIP --- */}
      <div className="bg-zinc-100 py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Truck, title: "Fast Shipping", sub: "Nationwide delivery" },
              { icon: Shield, title: "Genuine Parts", sub: "100% Authentic" },
              { icon: Wrench, title: "Fitment Check", sub: "Guaranteed to fit" },
              { icon: Zap, title: "Best Prices", sub: "Price match promise" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white border border-gray-200 rounded-full flex items-center justify-center text-red-600 shadow-sm">
                  <item.icon size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 uppercase text-sm">{item.title}</h3>
                  <p className="text-xs text-gray-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- CATEGORIES --- */}
      {categories.length > 0 && (
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl md:text-4xl font-black uppercase italic text-gray-900">Shop By <span className="text-red-600">Category</span></h2>
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
              {categories.slice(0, 6).map((cat, index) => (
                <motion.div 
                  key={cat.id} 
                  variants={fadeIn}
                  whileHover={{ y: -5 }}
                  className="group relative h-40 bg-zinc-50 border border-gray-200 rounded overflow-hidden hover:border-red-600 transition-colors cursor-pointer"
                >
                  <Link to={`/shop?category=${cat.id}`} className="block h-full w-full p-4 flex flex-col justify-between">
                    <div className="self-end p-2 bg-white rounded-full text-gray-400 group-hover:text-red-600 shadow-sm transition-colors">
                      <ChevronRight size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold uppercase text-lg leading-tight group-hover:text-red-600 transition-colors">
                        {cat.name}
                      </h3>
                      <span className="text-xs text-gray-500 mt-1 block">View Parts</span>
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
                    <div key={p.id} className="bg-white rounded p-3 text-gray-900">
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --- BEST SELLERS --- */}
      {bestSellers.length > 0 && (
        <section className="py-16 md:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <span className="text-red-600 font-bold uppercase tracking-widest text-sm">Top Rated</span>
              <h2 className="text-3xl md:text-4xl font-black uppercase text-gray-900 mt-2">Best Sellers</h2>
              <div className="w-24 h-1 bg-gray-300 mx-auto mt-4"></div>
            </div>
            
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {bestSellers.map(p => (
                <motion.div key={p.id} variants={fadeIn} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 hover:shadow-xl transition-shadow">
                  <ProductCard product={p} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;