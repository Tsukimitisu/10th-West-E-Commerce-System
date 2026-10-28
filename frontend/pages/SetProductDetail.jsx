import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Layers, ShoppingCart } from 'lucide-react';
import { getStorefrontSet } from '../services/api';
import { cartPendingKey, useCart } from '../context/CartContext';
import { getCurrentAuthUser } from '../services/authSession.js';
import RichText from '../components/ui/RichText';
import EmptyState from '../components/ui/EmptyState';
import BrandButton from '../components/ui/BrandButton';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import SetPurchaseSheet, { formatPeso } from '../components/customer/SetPurchaseSheet';
import { handleProductImageError, resolveProductImageUrl } from '../utils/productImages.js';

const BUY_NOW_SESSION_KEY = 'shopCoreBuyNowSession';

// The cart/checkout always receive the REAL selected child item; the set is
// only listing context (secondary label + membership check on add).
export const toCartProduct = (set, option) => ({
  id: option.id,
  name: option.name,
  price: option.price,
  image: option.image || set.image,
  stock_quantity: option.stock_quantity,
  part_number: option.part_number,
  color: option.color,
  parent_listing_id: set.id,
  parent_listing_name: set.name,
});

const SetProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart, isCartKeyPending } = useCart();
  const [set, setSet] = useState(null);
  const [status, setStatus] = useState('loading');
  const [selectedImage, setSelectedImage] = useState(0);
  const [intent, setIntent] = useState(null);
  const [cartError, setCartError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setSelectedImage(0);
    getStorefrontSet(id)
      .then((result) => { if (active) { setSet(result); setStatus('ready'); document.title = `${result.name} | 10th West Moto`; } })
      .catch(() => { if (active) { setSet(null); setStatus('missing'); } });
    return () => { active = false; };
  }, [id]);

  if (status === 'loading') {
    return <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2" aria-busy="true"><LoadingSkeleton className="aspect-square rounded-2xl" /><div className="space-y-4"><LoadingSkeleton className="h-8 w-3/4" /><LoadingSkeleton className="h-6 w-1/3" /><LoadingSkeleton className="h-24" /></div></div>;
  }
  if (status === 'missing' || !set) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="This set is not available" description="It may have been removed or is no longer listed in the storefront." action={<BrandButton to="/shop">Browse parts</BrandButton>} /></div>;
  }

  const images = (set.media || []).filter((entry) => entry.media_type === 'image').map((entry) => entry.url);
  const gallery = images.length ? images : [set.image].filter(Boolean);
  const anyAvailable = set.available_item_count > 0;
  const priceLabel = set.max_price > set.price ? `From ${formatPeso(set.price)}` : formatPeso(set.price);

  const handleAddToCart = async (option, quantity) => {
    setCartError('');
    const added = await addToCart(toCartProduct(set, option), quantity, { listingId: set.id });
    if (!added) setCartError('This item could not be added. Check availability and try again.');
    return added;
  };

  const handleBuyNow = (option, quantity) => {
    const session = {
      sessionId: `${option.id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      returnPath: `/sets/${set.id}`,
      item: { productId: option.id, product: toCartProduct(set, option), quantity },
    };
    sessionStorage.setItem(BUY_NOW_SESSION_KEY, JSON.stringify(session));
    setIntent(null);
    if (!getCurrentAuthUser()) navigate('/login?redirect=/checkout&buyNow=1');
    else navigate('/checkout?buyNow=1', { state: { buyNowSessionId: session.sessionId } });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1 text-sm text-slate-600">
        <Link to="/" className="hover:text-orange-700">Home</Link><ChevronRight size={14} aria-hidden="true" />
        <Link to="/shop" className="hover:text-orange-700">Shop</Link><ChevronRight size={14} aria-hidden="true" />
        <span className="truncate text-slate-900" aria-current="page">{set.name}</span>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <img src={resolveProductImageUrl(gallery[selectedImage])} onError={handleProductImageError} alt={set.name} className="h-full w-full object-contain" width="720" height="720" />
          </div>
          {gallery.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto" role="group" aria-label="Set images">
            {gallery.map((url, index) => <button key={url} type="button" onClick={() => setSelectedImage(index)} aria-label={`Show image ${index + 1}`} aria-pressed={index === selectedImage} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${index === selectedImage ? 'border-orange-600' : 'border-slate-200'}`}><img src={resolveProductImageUrl(url)} onError={handleProductImageError} alt="" className="h-full w-full object-cover" /></button>)}
          </div>}
        </div>
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"><Layers size={13} aria-hidden="true" />Set · {set.item_count} items</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-950 md:text-3xl">{set.name}</h1>
          {set.motorcycle_model && <p className="mt-2 text-sm text-slate-600">Fits <span className="font-semibold text-slate-900">{set.motorcycle_model}</span></p>}
          <p className="mt-4 text-3xl font-bold text-slate-950">{priceLabel}</p>
          <p className="mt-1 text-xs text-slate-600">Price depends on the item you choose.</p>
          <p className={`mt-3 text-sm font-semibold ${anyAvailable ? 'text-emerald-700' : 'text-red-700'}`}>{anyAvailable ? `${set.available_item_count} of ${set.item_count} items in stock` : 'Currently out of stock'}</p>
          <div className="mt-6 hidden gap-3 md:flex">
            <BrandButton size="lg" className="flex-1" disabled={!anyAvailable} onClick={() => setIntent('cart')}><ShoppingCart size={18} aria-hidden="true" />Add to Cart</BrandButton>
            <BrandButton size="lg" variant="secondary" className="flex-1" disabled={!anyAvailable} onClick={() => setIntent('buy')}>Buy Now</BrandButton>
          </div>
          {cartError && <p role="alert" className="mt-3 text-sm text-red-700">{cartError}</p>}
          <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="set-description-heading">
            <h2 id="set-description-heading" className="text-lg font-bold text-slate-950">Description</h2>
            <RichText value={set.description} fallback={<p className="text-sm text-slate-600">Choose the exact part you need from this set.</p>} className="mt-3 text-sm leading-6 text-slate-700" />
          </section>
          <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Included items ({set.item_count})</summary>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">{set.options.map((option) => <li key={option.id} className="flex justify-between gap-3"><span>{option.name}</span><span className={option.is_available ? 'text-slate-500' : 'text-red-700'}>{option.is_available ? formatPeso(option.price) : option.unavailable_reason}</span></li>)}</ul>
          </details>
        </div>
      </div>
      <div className="product-mobile-purchase-bar fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
          <BrandButton disabled={!anyAvailable} onClick={() => setIntent('cart')}><ShoppingCart size={18} aria-hidden="true" />Add to cart</BrandButton>
          <BrandButton variant="secondary" disabled={!anyAvailable} onClick={() => setIntent('buy')}>Buy Now</BrandButton>
        </div>
      </div>
      <SetPurchaseSheet
        set={set}
        intent={intent}
        onClose={() => setIntent(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        isPending={(optionId) => isCartKeyPending(cartPendingKey(optionId, null, set.id))}
      />
    </div>
  );
};

export default SetProductDetail;
