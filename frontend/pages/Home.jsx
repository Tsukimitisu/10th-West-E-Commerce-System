import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Headphones,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
} from 'lucide-react';
import {
  getBanners,
  getCategories,
  getProducts,
  getTopSellers,
  getWishlist,
  WISHLIST_SYNC_EVENT,
} from '../services/api';
import { getCurrentAuthUser, subscribeAuthChanges } from '../services/authSession.js';
import ProductCard from '../components/ProductCard';
import BrandButton from '../components/ui/BrandButton';
import EmptyState from '../components/ui/EmptyState';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';

const sectionMotion = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const ProductSection = ({ eyebrow, title, description, products, wishlistedIds, onWishlistToggle, light = true }) => {
  if (!products.length) return null;
  return (
    <section className={`py-14 sm:py-20 ${light ? 'bg-white' : 'bg-slate-50'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
            {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
          </div>
          <Link to="/shop" className="hidden shrink-0 items-center gap-2 text-sm font-semibold text-slate-700 transition-colors hover:text-red-600 sm:flex">
            Shop all <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {products.slice(0, 8).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlistedIds={wishlistedIds}
              onWishlistToggle={onWishlistToggle}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const Home = () => {
  const reduceMotion = useReducedMotion();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [currentBanner, setCurrentBanner] = useState(0);

  const activeBanners = useMemo(
    () => banners
      .filter((banner) => banner?.is_active !== false)
      .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)),
    [banners],
  );

  const featured = useMemo(
    () => products.filter((product) => product.is_on_sale || Number(product.rating) >= 4).slice(0, 8),
    [products],
  );

  const newArrivals = useMemo(
    () => [...products]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 8),
    [products],
  );

  const recentlyViewed = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    } catch {
      return [];
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    const user = getCurrentAuthUser();
    if (!user?.id) {
      setWishlistedIds([]);
      return;
    }
    try {
      const rows = await getWishlist(user.id);
      setWishlistedIds(rows.map((item) => Number(item.product_id ?? item.product?.id ?? item.id)).filter(Boolean));
    } catch {
      setWishlistedIds([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getProducts(), getCategories(), getBanners(), getTopSellers('all')])
      .then(([productResult, categoryResult, bannerResult, sellerResult]) => {
        if (!active) return;
        if (productResult.status === 'fulfilled') setProducts(productResult.value || []);
        else setCatalogError(true);
        if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value || []);
        if (bannerResult.status === 'fulfilled') setBanners(bannerResult.value || []);
        if (sellerResult.status === 'fulfilled') setBestSellers(sellerResult.value || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    void loadWishlist();
    window.addEventListener(WISHLIST_SYNC_EVENT, loadWishlist);
    const unsubscribe = subscribeAuthChanges(loadWishlist);
    return () => {
      active = false;
      window.removeEventListener(WISHLIST_SYNC_EVENT, loadWishlist);
      unsubscribe();
    };
  }, [loadWishlist]);

  useEffect(() => {
    if (reduceMotion || activeBanners.length < 2) return undefined;
    const timer = window.setInterval(
      () => setCurrentBanner((index) => (index + 1) % activeBanners.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [activeBanners.length, reduceMotion]);

  useEffect(() => {
    if (currentBanner >= activeBanners.length) setCurrentBanner(0);
  }, [activeBanners.length, currentBanner]);

  const toggleWishlist = (productId, selected) => {
    setWishlistedIds((current) => (
      selected
        ? Array.from(new Set([...current, Number(productId)]))
        : current.filter((id) => id !== Number(productId))
    ));
  };

  const hero = activeBanners[currentBanner];
  const heroLink = hero?.link_url || '/shop';

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="relative isolate min-h-[560px] overflow-hidden bg-[#0b1020] sm:min-h-[620px]">
        {hero?.image_url && (
          <motion.img
            key={hero.image_url}
            src={hero.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 0.48, scale: 1 }}
            transition={{ duration: 0.5 }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,13,25,0.98)_0%,rgba(11,16,32,0.88)_45%,rgba(11,16,32,0.35)_100%)]" />
        <div className="absolute -right-24 top-0 h-full w-2/5 -skew-x-12 bg-gradient-to-b from-red-600/15 to-orange-500/5" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[560px] max-w-7xl items-center px-4 py-20 sm:min-h-[620px] sm:px-6">
          <motion.div
            className="max-w-3xl"
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={sectionMotion}
            transition={{ duration: 0.45 }}
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-slate-200">
              <Sparkles size={14} className="text-orange-400" />
              Parts selected for Philippine riders
            </div>
            <h1 className="font-display text-4xl font-black leading-[1.06] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
              {hero?.title || <>Build a better ride. <span className="brand-gradient-text">Start here.</span></>}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {hero?.subtitle || 'Shop dependable motorcycle parts, riding gear, and accessories with clear stock status and support from people who know motorcycles.'}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <BrandButton to={heroLink} size="lg">
                {hero?.button_text || 'Shop motorcycle parts'} <ArrowRight size={18} />
              </BrandButton>
              <BrandButton to="/shop?sort=newest" variant="dark" size="lg">
                View new arrivals
              </BrandButton>
            </div>
          </motion.div>
        </div>

        {activeBanners.length > 1 && (
          <div className="absolute bottom-6 right-4 z-10 flex items-center gap-2 sm:right-8">
            <button
              type="button"
              onClick={() => setCurrentBanner((currentBanner - 1 + activeBanners.length) % activeBanners.length)}
              className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/20 text-white transition-colors hover:bg-white/12"
              aria-label="Previous promotion"
            >
              <ChevronLeft size={19} />
            </button>
            <span className="px-2 text-xs font-semibold tabular-nums text-slate-300" aria-live="polite">
              {currentBanner + 1} / {activeBanners.length}
            </span>
            <button
              type="button"
              onClick={() => setCurrentBanner((currentBanner + 1) % activeBanners.length)}
              className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/20 text-white transition-colors hover:bg-white/12"
              aria-label="Next promotion"
            >
              <ChevronRight size={19} />
            </button>
          </div>
        )}
      </section>

      <section aria-label="Store benefits" className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
          {[
            { icon: Truck, title: 'Fast delivery', copy: 'Tracked local shipping' },
            { icon: ShieldCheck, title: 'Secure checkout', copy: 'Protected transactions' },
            { icon: Wrench, title: 'Parts specialists', copy: 'Fitment guidance' },
            { icon: CreditCard, title: 'Flexible payment', copy: 'COD and GCash' },
          ].map(({ icon: Icon, title, copy }) => (
            <div key={title} className="flex min-h-28 items-center gap-3 bg-white px-4 py-5 sm:px-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <LoadingSkeleton className="h-8 w-56" />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                <LoadingSkeleton className="aspect-square w-full" />
                <LoadingSkeleton className="mt-4 h-4 w-2/3" />
                <LoadingSkeleton className="mt-3 h-5 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      ) : catalogError ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <EmptyState
            icon={PackageCheck}
            title="The catalog is temporarily unavailable"
            description="Please refresh the page or try again in a moment."
            action={<BrandButton onClick={() => window.location.reload()}>Try again</BrandButton>}
          />
        </section>
      ) : (
        <>
          {categories.length > 0 && (
            <section className="bg-slate-50 py-14 sm:py-20">
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <div className="mb-8 flex items-end justify-between gap-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Browse faster</p>
                    <h2 className="mt-2 font-display text-2xl font-extrabold text-slate-950 sm:text-3xl">Shop by category</h2>
                  </div>
                  <Link to="/shop" className="hidden items-center gap-2 text-sm font-semibold text-slate-700 hover:text-red-600 sm:flex">
                    All categories <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  {categories.slice(0, 6).map((category) => (
                    <Link
                      key={category.id}
                      to={`/shop?category=${category.id}`}
                      className="interactive-card group relative min-h-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-red-50 group-hover:text-red-600">
                        <Wrench size={17} aria-hidden="true" />
                      </span>
                      <h3 className="mt-6 font-display text-sm font-bold leading-5 text-slate-950">{category.name}</h3>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-red-600">
                        View parts <ChevronRight size={13} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          <ProductSection
            eyebrow="Recommended"
            title="Featured products"
            description="Popular, highly rated, and currently discounted items from the live catalog."
            products={featured}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
          />
          <ProductSection
            eyebrow="Proven choices"
            title="Best sellers"
            description="Products riders are buying most, based on completed order data."
            products={bestSellers}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
            light={false}
          />
          <ProductSection
            eyebrow="Just added"
            title="New arrivals"
            products={newArrivals}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
          />
          <ProductSection
            eyebrow="Pick up where you left off"
            title="Recently viewed"
            products={recentlyViewed}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
            light={false}
          />
        </>
      )}

      <section className="bg-[#0b1020] py-14 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-orange-400">
              <Headphones size={23} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold">Not sure which part fits?</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">Send us your motorcycle make, model, and year. Our support team will help you narrow it down.</p>
            </div>
          </div>
          <BrandButton to="/contact" variant="dark" className="shrink-0">Contact support</BrandButton>
        </div>
      </section>
    </main>
  );
};

export default Home;
