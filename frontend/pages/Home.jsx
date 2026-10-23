import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Headphones,
  PackageCheck,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  getBanners,
  getAnnouncements,
  getCategories,
  getProducts,
  getMotorcycleModels,
  getTopSellers,
  getWishlist,
  WISHLIST_SYNC_EVENT,
} from '../services/api';
import { getCurrentAuthUser, subscribeAuthChanges } from '../services/authSession.js';
import ManagedHeroCarousel from '../components/customer/ManagedHeroCarousel';
import { managedHeroSlides } from '../utils/managedHero.js';
import ProductCard from '../components/ProductCard';
import BrandButton from '../components/ui/BrandButton';
import EmptyState from '../components/ui/EmptyState';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';

const ProductSection = ({ title, description, products, wishlistedIds, onWishlistToggle, light = true }) => {
  if (!products.length) return null;
  return (
    <section className={`home-section ${light ? '' : 'home-section-muted'}`}>
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <div className="home-section-heading">
          <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <Link to="/shop">Shop all <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 sm:gap-5">
          {products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} wishlistedIds={wishlistedIds} onWishlistToggle={onWishlistToggle} />)}
        </div>
      </div>
    </section>
  );
};

const Home = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [models, setModels] = useState([]);
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [heroLoading, setHeroLoading] = useState(true);
  const [bestSellers, setBestSellers] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const slides = useMemo(() => managedHeroSlides(banners, announcements), [banners, announcements]);

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
    Promise.allSettled([getProducts(), getCategories(), getTopSellers('all'), getMotorcycleModels()])
      .then(([productResult, categoryResult, sellerResult, modelResult]) => {
        if (!active) return;
        if (productResult.status === 'fulfilled') setProducts(productResult.value || []);
        else setCatalogError(true);
        if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value || []);
        if (sellerResult.status === 'fulfilled') setBestSellers(sellerResult.value || []);
        if (modelResult.status === 'fulfilled') setModels(modelResult.value || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    Promise.allSettled([getBanners(), getAnnouncements()]).then(([bannerResult, announcementResult]) => {
      if (!active) return;
      if (bannerResult.status === 'fulfilled') setBanners(bannerResult.value || []);
      if (announcementResult.status === 'fulfilled') setAnnouncements(announcementResult.value || []);
      setHeroLoading(false);
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

  const toggleWishlist = (productId, selected) => {
    setWishlistedIds((current) => (
      selected
        ? Array.from(new Set([...current, Number(productId)]))
        : current.filter((id) => id !== Number(productId))
    ));
  };

  const maintenance = products.filter((product) => /\boil\b|lubricant|maintenance|motul|castrol|chain cleaner|brake cleaner/i.test(`${product.category_name || ''} ${product.name || ''}`));
  const accessories = products.filter((product) => /accessor|gear|helmet|glove/i.test(`${product.category_name || ''} ${product.name || ''}`));

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <ManagedHeroCarousel slides={slides} loading={heroLoading} />

      <section id="motorcycle-models" className="home-section home-model-section home-section-muted" aria-labelledby="model-title">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="home-section-heading"><div><h2 id="model-title">Shop by motorcycle</h2><p>Start with your ride. Confirm compatibility in the part details.</p></div><Link to="/shop">All motorcycle parts <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <div className="home-model-grid" style={{ '--model-columns': Math.min(models.length || 1, 4) }}>
            {models.length ? models.slice(0, 8).map((model) => <Link className="home-model-card" key={model.id || model.model_name} to={`/shop?model=${encodeURIComponent(model.model_name || model.name || model.model || '')}`}><small>{model.brand || 'Motorcycle model'}</small><strong>{model.model_name || model.name || model.model}</strong><span>Find parts <ArrowRight size={17} aria-hidden="true" /></span></Link>) : <Link className="home-model-card" to="/shop"><Wrench size={22} aria-hidden="true" /><strong>Find your model</strong><span>Browse the catalog <ArrowRight size={17} aria-hidden="true" /></span></Link>}
          </div>
          {categories.length > 0 && <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-200 pt-5" aria-label="Part categories">{categories.slice(0, 8).map(category => <Link key={category.id} to={`/shop?model=${encodeURIComponent(category.name)}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 hover:text-orange-700">{category.name}<ArrowRight size={14} aria-hidden="true" /></Link>)}</div>}
        </div>
      </section>

      {loading ? <section className="home-section mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8" aria-label="Loading parts"><LoadingSkeleton className="h-8 w-56" /><div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <LoadingSkeleton key={index} className="aspect-square w-full" />)}</div></section>
        : catalogError ? <section className="home-section mx-auto max-w-[1500px] px-4"><EmptyState icon={PackageCheck} title="The catalog is temporarily unavailable" description="Refresh the page or try again in a moment." action={<BrandButton onClick={() => window.location.reload()}>Try again</BrandButton>} /></section>
        : <>
          {!products.length && <section className="home-section mx-auto max-w-[1500px] px-4"><EmptyState icon={PackageCheck} title="No products are available yet" description="Contact the store for help finding a part." action={<BrandButton to="/contact">Contact the store</BrandButton>} /></section>}
          <ProductSection title="Featured Parts" description="Parts and current offers from the 10th West catalog." products={featured.length ? featured : products} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} />
          <ProductSection title="Best sellers" description="Based on completed orders." products={bestSellers} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} />
          <ProductSection title="Oils & Maintenance" products={maintenance} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} light={false} />
          <ProductSection title="Accessories" products={accessories} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} />
          <ProductSection title="New arrivals" products={newArrivals} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} light={false} />
          <ProductSection title="Recently viewed" products={recentlyViewed} wishlistedIds={wishlistedIds} onWishlistToggle={toggleWishlist} />
        </>}

      <section className="home-section" aria-labelledby="why-title">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="home-section-heading"><h2 id="why-title">Why 10th West</h2></div>
          <div className="home-benefits">
            {[{ icon: PackageCheck, title: 'Clear stock', copy: 'Check availability before you order.' },{ icon: Wrench, title: 'Clear fitment', copy: 'Part numbers and model details, together.' },{ icon: Headphones, title: 'Shop support', copy: 'Ask our team before choosing your part.' },{ icon: ShieldCheck, title: 'Secure checkout', copy: 'Review delivery and payment before placing your order.' }].map(({icon: Icon,title,copy}) => <div key={title}><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{copy}</p></div>)}
          </div>
        </div>
      </section>
      <section className="home-support"><div className="mx-auto flex max-w-[1500px] flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8"><div><h2>Get the right part, the first time.</h2><p>Tell us your motorcycle make, model and year. Our shop team can help you choose.</p></div><BrandButton to="/contact" variant="secondary" className="shrink-0">Contact the shop <ArrowRight size={16} aria-hidden="true" /></BrandButton></div></section>
    </main>
  );
};

export default Home;
