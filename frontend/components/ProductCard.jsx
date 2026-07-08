import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Heart, ShoppingCart, Star } from 'lucide-react';
import { addToWishlist, getWishlist, removeFromWishlist } from '../services/api';
import { getCurrentAuthUser } from '../services/authSession.js';
import { useCart } from '../context/CartContext';
import PriceDisplay from './ui/PriceDisplay';
import StatusBadge from './ui/StatusBadge';
import { handleProductImageError, resolveProductImageUrl } from '../utils/productImages.js';

const ProductCard = ({ product, wishlistedIds, onWishlistToggle, view = 'grid' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart, loading: cartLoading } = useCart();
  const productId = Number(product.id);
  const hasExternalWishlistState = Array.isArray(wishlistedIds);
  const [wishlisted, setWishlisted] = useState(
    hasExternalWishlistState ? wishlistedIds.map(Number).includes(productId) : false,
  );
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (hasExternalWishlistState) {
      setWishlisted(wishlistedIds.map(Number).includes(productId));
      return;
    }
    const load = async () => {
      const userId = getCurrentAuthUser()?.id;
      if (!userId) return;
      try {
        const items = await getWishlist(userId);
        setWishlisted(items.some((item) => Number(item.product_id ?? item.product?.id ?? item.id) === productId));
      } catch {
        setWishlisted(false);
      }
    };
    void load();
  }, [hasExternalWishlistState, productId, wishlistedIds]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  const stock = Math.max(0, Number(product.stock_quantity ?? 0));
  const outOfStock = stock <= 0 || product.status === 'out_of_stock';
  const lowStock = !outOfStock && stock <= Number(product.low_stock_threshold || 5);
  const onSale = Boolean(product.is_on_sale && Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.price));
  const discount = onSale ? Math.round((1 - Number(product.sale_price) / Number(product.price)) * 100) : 0;
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const productUrl = `/products/${product.id}`;
  const image = resolveProductImageUrl(product.image || product.image_url);

  const handleWishlist = async () => {
    const userId = getCurrentAuthUser()?.id;
    if (!userId) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    const next = !wishlisted;
    setWishlisted(next);
    try {
      if (next) await addToWishlist(userId, productId);
      else await removeFromWishlist(userId, productId);
      onWishlistToggle?.(productId, next);
    } catch {
      setWishlisted(!next);
    }
  };

  const handleAddToCart = async () => {
    if (outOfStock) return;
    if (hasVariants) {
      navigate(productUrl);
      return;
    }
    const success = await addToCart(product, 1);
    if (success) setAdded(true);
  };

  const stockBadge = outOfStock
    ? <StatusBadge tone="danger" dot>Out of stock</StatusBadge>
    : lowStock
      ? <StatusBadge tone="warning" dot>Only {stock} left</StatusBadge>
      : <StatusBadge tone="success" dot>In stock</StatusBadge>;

  if (view === 'list') {
    return (
      <article className="interactive-card flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <Link to={productUrl} className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-36 sm:w-40" aria-label={`View ${product.name}`}>
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            onError={handleProductImageError}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
          {onSale && <span className="absolute left-2 top-2 rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white">Save {discount}%</span>}
        </Link>
        <div className="min-w-0 flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              {product.category_name && <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">{product.category_name}</p>}
              <Link to={productUrl} className="mt-1 block font-display text-base font-bold text-slate-950 hover:text-red-600">{product.name}</Link>
            </div>
            <button
              type="button"
              onClick={handleWishlist}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
              aria-pressed={wishlisted}
            >
              <Heart size={18} className={wishlisted ? 'fill-red-500 text-red-500' : ''} />
            </button>
          </div>
          {product.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{product.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {stockBadge}
            {Number(product.rating) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                <Star size={14} className="fill-amber-400 text-amber-400" /> {Number(product.rating).toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
            <PriceDisplay price={product.price} salePrice={onSale ? product.sale_price : null} />
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={outOfStock || cartLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:bg-slate-300"
            >
              {added ? <Check size={16} /> : <ShoppingCart size={16} />}
              {added ? 'Added' : hasVariants ? 'Choose options' : 'Add to cart'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="interactive-card group flex h-full min-h-[350px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <Link to={productUrl} className="block aspect-square overflow-hidden bg-slate-100" aria-label={`View ${product.name}`}>
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            onError={handleProductImageError}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
          />
        </Link>
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
          {onSale && <span className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">SAVE {discount}%</span>}
          {lowStock && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 shadow-sm">LOW STOCK</span>}
        </div>
        <button
          type="button"
          onClick={handleWishlist}
          className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-xl border border-white/60 bg-white/92 text-slate-500 shadow-sm backdrop-blur transition-colors hover:text-red-600"
          aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={wishlisted}
        >
          <Heart size={18} className={wishlisted ? 'fill-red-500 text-red-500' : ''} />
        </button>
        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-white/72 backdrop-blur-[1px]">
            <span className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">OUT OF STOCK</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-red-600">
            {product.category_name || product.brand || 'Moto part'}
          </p>
          {Number(product.rating) > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-700">
              <Star size={12} className="fill-amber-400 text-amber-400" /> {Number(product.rating).toFixed(1)}
            </span>
          )}
        </div>
        <Link to={productUrl} className="mt-1.5 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-slate-950 transition-colors hover:text-red-600">
          {product.name}
        </Link>
        <div className="mt-2">
          {outOfStock ? (
            <span className="text-[11px] font-medium text-red-700">Currently unavailable</span>
          ) : lowStock ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"><AlertTriangle size={12} /> {stock} left</span>
          ) : (
            <span className="text-[11px] font-medium text-emerald-700">In stock</span>
          )}
        </div>
        <PriceDisplay className="mt-auto pt-3" price={product.price} salePrice={onSale ? product.sale_price : null} />
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={outOfStock || cartLoading}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-red-600 disabled:bg-slate-300"
        >
          {added ? <Check size={15} /> : <ShoppingCart size={15} />}
          {added ? 'Added to cart' : hasVariants ? 'Choose options' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
};

export default ProductCard;
