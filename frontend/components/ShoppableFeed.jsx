import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Package, Play, ShoppingBag, Star, Truck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { addToWishlist, createChatThread, removeFromWishlist, WISHLIST_SYNC_EVENT } from '../services/api';
import { getCurrentAuthUser } from '../services/authSession.js';

const BUY_NOW_SESSION_KEY = 'shopCoreBuyNowSession';

const formatPrice = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const getPrimaryMedia = (product) => {
  if (product?.video_url) return { type: 'video', src: product.video_url };
  if (product?.image) return { type: 'image', src: product.image };
  if (Array.isArray(product?.image_urls) && product.image_urls[0]) return { type: 'image', src: product.image_urls[0] };
  return { type: 'image', src: '/images/product-fallback.svg' };
};

const ShoppableFeed = ({ products = [], wishlistedIds = [], onWishlistToggle }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyProductId, setBusyProductId] = useState(null);

  const feedProducts = useMemo(() => (
    products
      .filter((product) => product?.status !== 'archived')
      .sort((a, b) => {
        const videoScore = Number(Boolean(b.video_url)) - Number(Boolean(a.video_url));
        if (videoScore !== 0) return videoScore;
        return Number(b.total_sold || 0) - Number(a.total_sold || 0);
      })
      .slice(0, 12)
  ), [products]);

  if (feedProducts.length === 0) return null;

  const product = feedProducts[Math.min(activeIndex, feedProducts.length - 1)];
  const media = getPrimaryMedia(product);
  const isOutOfStock = Number(product.stock_quantity || 0) <= 0 || product.status === 'out_of_stock';
  const isWishlisted = wishlistedIds.includes(Number(product.id));
  const unitPrice = product.is_on_sale && product.sale_price ? product.sale_price : product.price;

  const handleWishlist = async () => {
    const user = getCurrentAuthUser();
    if (!user?.id) {
      navigate('/login');
      return;
    }
    const next = !isWishlisted;
    onWishlistToggle?.(product.id, next);
    try {
      if (next) await addToWishlist(user.id, product.id);
      else await removeFromWishlist(user.id, product.id);
      window.dispatchEvent(new Event(WISHLIST_SYNC_EVENT));
    } catch {
      onWishlistToggle?.(product.id, !next);
    }
  };

  const handleChat = async () => {
    const user = getCurrentAuthUser();
    if (!user?.id) {
      navigate(`/login?redirect=/products/${product.id}`);
      return;
    }

    setBusyProductId(product.id);
    try {
      await createChatThread({
        product_id: product.id,
        subject: product.name,
        message: `Hi, I want to ask about ${product.name}.`,
      });
      navigate('/orders');
    } finally {
      setBusyProductId(null);
    }
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    sessionStorage.setItem(BUY_NOW_SESSION_KEY, JSON.stringify({
      sessionId: `${product.id}-${Date.now()}`,
      returnPath: `/products/${product.id}`,
      item: {
        productId: product.id,
        quantity: 1,
        product,
      },
    }));
    navigate('/checkout?buyNow=1');
  };

  const handleAddToCart = async () => {
    if (isOutOfStock) return;
    setBusyProductId(product.id);
    try {
      await addToCart(product, 1);
    } finally {
      setBusyProductId(null);
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-slate-200 bg-zinc-950 text-white shadow-xl">
      <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[560px] bg-black">
          {media.type === 'video' ? (
            <video
              src={media.src}
              className="h-full min-h-[560px] w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
            />
          ) : (
            <img src={media.src} alt={product.name} className="h-full min-h-[560px] w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
          <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
              <Play size={13} /> Shop Feed
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold">
              <Truck size={13} /> Standard Delivery
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-8">
            <div className="max-w-2xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {product.product_type === 'bundle' && <span className="rounded-full bg-blue-500 px-2.5 py-1 text-xs font-semibold">Bundle</span>}
                {product.category_name && <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{product.category_name}</span>}
                {product.rating !== undefined && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold"><Star size={13} className="fill-yellow-400 text-yellow-400" /> {product.rating || 0}</span>}
              </div>
              <Link to={`/products/${product.id}`} className="text-2xl font-bold leading-tight hover:text-red-200 lg:text-4xl">{product.name}</Link>
              <p className="mt-2 line-clamp-2 text-sm text-white/75">{product.description}</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <span className="text-3xl font-extrabold text-red-300">{formatPrice(unitPrice)}</span>
                {product.is_on_sale && product.sale_price && <span className="pb-1 text-sm text-white/50 line-through">{formatPrice(product.price)}</span>}
                <span className={`pb-1 text-sm font-semibold ${isOutOfStock ? 'text-red-300' : 'text-green-300'}`}>{isOutOfStock ? 'Sold out' : `${product.stock_quantity} available`}</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 right-4 flex flex-col gap-3">
            <button type="button" onClick={handleWishlist} className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">
              <Heart size={21} className={isWishlisted ? 'fill-red-500 text-red-500' : 'text-white'} />
            </button>
            <button type="button" onClick={handleChat} className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">
              <MessageCircle size={21} />
            </button>
          </div>
        </div>

        <aside className="flex flex-col border-t border-white/10 bg-zinc-950 lg:border-l lg:border-t-0">
          <div className="border-b border-white/10 p-4">
            <p className="text-sm font-semibold">Trending parts</p>
            <p className="text-xs text-white/50">Swipe-style picks from the catalog</p>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-3 lg:max-h-none lg:flex-1">
            {feedProducts.map((item, index) => {
              const itemMedia = getPrimaryMedia(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`mb-2 flex w-full gap-3 rounded-2xl p-2 text-left transition ${index === activeIndex ? 'bg-white/15' : 'hover:bg-white/10'}`}
                >
                  <div className="h-16 w-16 overflow-hidden rounded-xl bg-zinc-800">
                    <img src={itemMedia.src} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 text-xs text-white/50">{formatPrice(item.is_on_sale && item.sale_price ? item.sale_price : item.price)}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isOutOfStock || busyProductId === product.id}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Package size={17} /> Add
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={isOutOfStock}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag size={17} /> Buy Now
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default ShoppableFeed;
