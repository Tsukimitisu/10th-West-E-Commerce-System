import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Heart, ShoppingCart, Star } from 'lucide-react';
import { addToWishlist, getWishlist, removeFromWishlist } from '../services/api';
import { getCurrentAuthUser } from '../services/authSession.js';
import { useCart } from '../context/CartContext';
import PriceDisplay from './ui/PriceDisplay';
import { handleProductImageError, resolveProductImageUrl } from '../utils/productImages.js';
import { richTextToPlainText } from '../utils/richText.js';

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

  return (
    <article className={`product-card interactive-card flex ${view === 'list' ? 'flex-col sm:flex-row' : 'h-full flex-col'}`}>
      <div className={`relative ${view === 'list' ? 'shrink-0 sm:w-56' : ''}`}>
        <Link to={productUrl} className="product-photo" aria-label={`View ${product.name}`}>
          <img src={image} alt={product.name} loading="lazy" width="480" height="480" onError={handleProductImageError} />
        </Link>
        {onSale && <span className="product-sale-label">Save {discount}%</span>}
        <button type="button" onClick={handleWishlist} className="product-wishlist" aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={wishlisted}>
          <Heart size={18} className={wishlisted ? 'fill-orange-500 text-orange-700' : ''} aria-hidden="true" />
        </button>
      </div>
      <div className="product-card-info">
        <p className="product-card-meta">{[product.brand, product.motorcycle_model || product.category_name].filter(Boolean).join(' · ') || 'Motorcycle part'}</p>
        <Link to={productUrl} className="product-card-name line-clamp-2">{product.name}</Link>
        {(product.part_number || product.sku) && <p className="product-card-meta mt-1">Part # {product.part_number || product.sku}</p>}
        {view === 'list' && product.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{richTextToPlainText(product.description)}</p>}
        <div className="product-stock-line flex flex-wrap items-center justify-between gap-1">
          <span>{outOfStock ? 'Out of stock' : lowStock ? <><AlertTriangle size={13} aria-hidden="true" />Only {stock} left</> : 'In stock'}</span>
          {Number(product.rating) > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-700"><Star size={13} className="fill-slate-700" aria-hidden="true" />{Number(product.rating).toFixed(1)}<span className="sr-only"> out of 5</span></span>}
        </div>
        <PriceDisplay className="product-price" price={product.price} salePrice={onSale ? product.sale_price : null} />
        <button type="button" onClick={handleAddToCart} disabled={outOfStock || cartLoading} className="product-card-button">
          {added ? <Check size={16} aria-hidden="true" /> : <ShoppingCart size={16} aria-hidden="true" />}
          {outOfStock ? 'Unavailable' : added ? 'Added to cart' : hasVariants ? 'Choose options' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
};

export default ProductCard;
