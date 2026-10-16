import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Headphones,
  PackageCheck,
  Search,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react';
import {
  getBanners,
  getCategories,
  getProducts,
  getMotorcycleModels,
  getTopSellers,
  getWishlist,
  WISHLIST_SYNC_EVENT,
} from '../services/api';
import { getCurrentAuthUser, subscribeAuthChanges } from '../services/authSession.js';
import ProductCard from '../components/ProductCard';
import BrandButton from '../components/ui/BrandButton';
import EmptyState from '../components/ui/EmptyState';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import BrandLogo from '../components/ui/BrandLogo';
import PriceDisplay from '../components/ui/PriceDisplay';
import { handleProductImageError, resolveProductImageUrl } from '../utils/productImages';

const ProductSection = ({ title, description, products, wishlistedIds, onWishlistToggle, light = true }) => {
  if (!products.length) return null;
  return (
    <section className={`py-10 sm:py-14 ${light ? 'bg-white' : 'bg-slate-50'}`}>
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
            {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
          </div>
          <Link to="/shop" className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-orange-200 hover:text-orange-700 sm:flex">
            Shop all <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:gap-5">
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
  const navigate = useNavigate();
  const [heroSearch, setHeroSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [models, setModels] = useState([]);
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
    Promise.allSettled([getProducts(), getCategories(), getBanners(), getTopSellers('all'), getMotorcycleModels()])
      .then(([productResult, categoryResult, bannerResult, sellerResult, modelResult]) => {
        if (!active) return;
        if (productResult.status === 'fulfilled') setProducts(productResult.value || []);
        else setCatalogError(true);
        if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value || []);
        if (bannerResult.status === 'fulfilled') setBanners(bannerResult.value || []);
        if (sellerResult.status === 'fulfilled') setBestSellers(sellerResult.value || []);
        if (modelResult.status === 'fulfilled') setModels(modelResult.value || []);
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
  const heroProduct = products.find((product) => Number(product.stock_quantity) > 0 && (product.image || product.image_url));
  const maintenance = products.filter((product) => /\boil\b|lubricant|maintenance|motul|castrol|chain cleaner|brake cleaner/i.test(`${product.category_name || ''} ${product.name || ''}`));
  const accessories = products.filter((product) => /accessor|gear|helmet|glove/i.test(`${product.category_name || ''} ${product.name || ''}`));

  const submitHeroSearch = (event) => {
    event.preventDefault();
    navigate(`/shop?search=${encodeURIComponent(heroSearch.trim())}`);
  };

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-inner mx-auto max-w-[1500px]">
          <div className="home-hero-copy">
            <h1 id="home-title">Parts Built<br />for the <span>Ride.</span></h1>
            <p>Find dependable motorcycle parts, oils, accessories, and replacement components with clear stock and fitment information.</p>
            <form onSubmit={submitHeroSearch} role="search" className="home-search">
              <label htmlFor="home-part-search" className="sr-only">Search parts</label>
              <Search size={20} aria-hidden="true" />
              <input id="home-part-search" type="search" value={heroSearch} onChange={(event) => setHeroSearch(event.target.value)} placeholder="Part name, number, or model…" autoComplete="off" />
              <button type="submit">Search</button>
            </form>
            <div className="home-hero-actions">
              <BrandButton to="/shop" size="lg">Shop Parts <ArrowRight size={18} aria-hidden="true" /></BrandButton>
              <a href="#motorcycle-models" onClick={(event) => { event.preventDefault(); document.getElementById('motorcycle-models')?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth' }); }} className="home-model-link">Browse Motorcycle Models <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="home-hero-footnote"><PackageCheck size={16} aria-hidden="true" /> Clear stock. Precise fitment. Ready for your next ride.</div>
          </div>
          <div className="home-merch-panel">
            {hero?.image_url ? <a href={heroLink.startsWith('/') ? `#${heroLink}` : heroLink} className="home-promotion">
              <img src={hero.image_url} alt={hero.title || '10th West store promotion'} width="640" height="540" fetchPriority="high" />
              {hero.title && <div className="home-promotion-copy"><h2>{hero.title}</h2>{hero.subtitle && <p>{hero.subtitle}</p>}<span>{hero.button_text || 'Explore parts'} <ArrowRight size={16} aria-hidden="true" /></span></div>}
            </a> : heroProduct ? <Link to={`/products/${heroProduct.id}`} className="home-hero-product">
              <div className="home-product-stage"><img src={resolveProductImageUrl(heroProduct.image || heroProduct.image_url)} alt={heroProduct.name} onError={handleProductImageError} width="640" height="480" fetchPriority="high" /></div>
              <div className="home-product-caption"><div><p>{heroProduct.motorcycle_model || heroProduct.brand || 'From the parts counter'}</p><h2>{heroProduct.name}</h2><span>{heroProduct.part_number || heroProduct.sku}</span></div><PriceDisplay price={heroProduct.price} salePrice={heroProduct.is_on_sale ? heroProduct.sale_price : null} /></div>
            </Link> : <div className="home-brand-stage"><BrandLogo dark link={false} compact /><p>Motorcycle Parts & Accessories</p></div>}
            <div className="home-merch-base"><span>10TH WEST</span><span>BUILT AROUND YOUR RIDE</span></div>
            {activeBanners.length > 1 && <div className="home-banner-controls">
              <button type="button" onClick={() => setCurrentBanner((currentBanner - 1 + activeBanners.length) % activeBanners.length)} aria-label="Previous promotion"><ChevronLeft size={18} /></button>
              <span aria-live="polite">{currentBanner + 1} / {activeBanners.length}</span>
              <button type="button" onClick={() => setCurrentBanner((currentBanner + 1) % activeBanners.length)} aria-label="Next promotion"><ChevronRight size={18} /></button>
            </div>}
          </div>
        </div>
      </section>

      <section aria-label="Store benefits" className="border-b border-slate-200 bg-white">
        <h2 className="mx-auto max-w-[1500px] px-4 pt-8 font-display text-3xl font-semibold text-slate-900 sm:px-6 lg:px-8">Why Shop at 10th West</h2>
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
          {[
            { icon: Truck, title: 'Tracked delivery', copy: 'Follow your order' },
            { icon: ShieldCheck, title: 'Secure checkout', copy: 'Clear payment options' },
            { icon: Wrench, title: 'Parts specialists', copy: 'Fitment guidance' },
            { icon: CreditCard, title: 'Payment options', copy: 'Shown at checkout' },
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

      <section id="motorcycle-models" className="home-model-section" aria-labelledby="model-title">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="home-section-heading"><h2 id="model-title">Shop by Motorcycle Model</h2><Link to="/shop">Browse all parts <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <p className="mb-5 text-sm text-slate-600">Start with your motorcycle. Check the product details to confirm compatibility.</p>
          <div className="home-model-grid">
            {models.length ? models.slice(0, 8).map((model) => <Link key={model.id || model.model_name} to={`/shop?model=${encodeURIComponent(model.model_name || model.name || model.model || '')}`}><Wrench size={20} aria-hidden="true" /><span><small>{model.brand || 'Motorcycle model'}</small><strong>{model.model_name || model.name || model.model}</strong></span><ArrowRight size={17} aria-hidden="true" /></Link>) : <Link to="/shop"><Wrench size={22} aria-hidden="true" /><span><strong>Find parts for your motorcycle</strong><small>Use the model filters in our catalog</small></span><ArrowRight size={17} aria-hidden="true" /></Link>}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:px-8">
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
        <section className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            icon={PackageCheck}
            title="The catalog is temporarily unavailable"
            description="Please refresh the page or try again in a moment."
            action={<BrandButton onClick={() => window.location.reload()}>Try again</BrandButton>}
          />
        </section>
      ) : (
        <>
          {products.length === 0 && (
            <section className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:px-8">
              <EmptyState
                icon={PackageCheck}
                title="No products are available yet"
                description="The catalog is connected, but no products have been published."
                action={<BrandButton to="/contact">Contact the store</BrandButton>}
              />
            </section>
          )}
          {categories.length > 0 && (
            <section className="bg-slate-50 py-10 sm:py-14">
              <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
                <div className="mb-6 flex items-end justify-between gap-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Shop by category</h2>
                  </div>
                  <Link to="/shop" className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-orange-200 hover:text-orange-700 sm:flex">
                    All categories <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  {categories.slice(0, 6).map((category) => (
                    <Link
                      key={category.id}
                      to={`/shop?category=${category.id}`}
                      className="interactive-card group relative min-h-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-orange-50 group-hover:text-orange-700">
                        <Wrench size={17} aria-hidden="true" />
                      </span>
                      <h3 className="mt-6 font-display text-sm font-bold leading-5 text-slate-950">{category.name}</h3>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors group-hover:text-orange-700">
                        View parts <ChevronRight size={13} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          <ProductSection
            title="Featured Parts"
            description="Explore selected parts and current offers from the catalog."
            products={featured}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
          />
          <ProductSection
            title="Best sellers"
            description="Products riders are buying most, based on completed order data."
            products={bestSellers}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
            light={false}
          />
          <ProductSection
            title="New arrivals"
            products={newArrivals}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
          />
          <ProductSection title="Oils & Maintenance" description="Keep the everyday essentials ready." products={maintenance} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} light={false} />
          <ProductSection title="Accessories" products={accessories} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} />
          <ProductSection
            title="Recently viewed"
            products={recentlyViewed}
            wishlistedIds={wishlistedIds}
            onWishlistToggle={toggleWishlist}
            light={false}
          />
        </>
      )}

      <section className="home-shop-support bg-[#12204e] py-14 text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-orange-400">
              <Headphones size={23} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold">Your shop. Your parts specialists.</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">Not sure which part fits? Send your motorcycle make, model and year, or contact us for physical shop support.</p>
            </div>
          </div>
          <BrandButton to="/contact" variant="dark" className="shrink-0">Contact support</BrandButton>
        </div>
      </section>
    </main>
  );
};

export default Home;
