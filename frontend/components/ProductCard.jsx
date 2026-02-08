import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Star, ArrowRight, Tag, AlertTriangle } from 'lucide-react';
import { addToWishlist, removeFromWishlist } from '../services/api';

const ProductCard = ({ product, wishlistedIds = [], onWishlistToggle, view = 'grid' }) => {
  const isWishlisted = wishlistedIds.includes(product.id);
  const isOutOfStock = product.stock_quantity <= 0;
  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= (product.low_stock_threshold || 5);
  const hasDiscount = product.is_on_sale && product.sale_price;
  const discountPercent = hasDiscount ? Math.round((1 - (product.sale_price / product.price)) * 100) : 0;

  const handleWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const user = localStorage.getItem('shopCoreUser');
      if (!user) return;
      const userId = JSON.parse(user).id;
      if (isWishlisted) await removeFromWishlist(userId, product.id);
      else await addToWishlist(userId, product.id);
      onWishlistToggle?.();
    } catch {}
  };

  const formatPrice = (p) => `â‚±${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (view === 'list') {
    return (
      <Link to={`/products/${product.id}`} className="group flex gap-4 bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all duration-300">
        <div className="w-32 h-32 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden relative">
          <img src={product.image || 'https://via.placeholder.com/300?text=No+Image'} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          {isOutOfStock && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><span className="text-xs font-bold text-red-600 bg-white px-2 py-1 rounded">SOLD OUT</span></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              {product.category_name && <span className="text-xs font-medium text-red-600">{product.category_name}</span>}
              <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors line-clamp-1">{product.name}</h3>
            </div>
            <button onClick={handleWishlist} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
              <Heart size={18} className={isWishlisted ? 'text-red-500 fill-red-500' : 'text-gray-300 hover:text-red-400'} />
            </button>
          </div>
          <p className="text-sm text-gray-500 line-clamp-2 mt-1">{product.description}</p>
          <div className="flex items-center gap-2 mt-2">
            {product.rating && <div className="flex items-center gap-1"><Star size={14} className="text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{product.rating}</span></div>}
            {product.brand && <span className="text-xs text-gray-400">â€¢ {product.brand}</span>}
            {isLowStock && <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> Low stock</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {hasDiscount ? (
              <>
                <span className="font-bold text-red-600">{formatPrice(product.sale_price)}</span>
                <span className="text-sm text-gray-400 line-through">{formatPrice(product.price)}</span>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">-{discountPercent}%</span>
              </>
            ) : (
              <span className="font-bold text-gray-900">{formatPrice(product.price)}</span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/products/${product.id}`} className="group bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all duration-300">
      {/* Image */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <img
          src={product.image || 'https://via.placeholder.com/300?text=No+Image'}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasDiscount && (
            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1"><Tag size={10} /> -{discountPercent}%</span>
          )}
          {isLowStock && !isOutOfStock && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md">Low Stock</span>
          )}
        </div>
        {/* Wishlist */}
        <button onClick={handleWishlist} className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white hover:scale-110 transition-all">
          <Heart size={16} className={isWishlisted ? 'text-red-500 fill-red-500' : 'text-gray-400'} />
        </button>
        {/* Overlay for out of stock */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg">SOLD OUT</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-1">
          {product.category_name && <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">{product.category_name}</span>}
          {product.brand && <span className="text-[11px] text-gray-400">{product.brand}</span>}
        </div>
        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-red-600 transition-colors line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        {product.rating !== undefined && (
          <div className="flex items-center gap-1 mt-1.5">
            <Star size={13} className="text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-medium text-gray-700">{product.rating}</span>
            {product.reviewCount !== undefined && <span className="text-xs text-gray-400">({product.reviewCount})</span>}
          </div>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-2">
            {hasDiscount ? (
              <>
                <span className="font-bold text-red-600">{formatPrice(product.sale_price)}</span>
                <span className="text-xs text-gray-400 line-through">{formatPrice(product.price)}</span>
              </>
            ) : (
              <span className="font-bold text-gray-900">{formatPrice(product.price)}</span>
            )}
          </div>
          <div className="w-8 h-8 bg-gray-50 group-hover:bg-red-600 rounded-lg flex items-center justify-center transition-colors">
            <ArrowRight size={14} className="text-gray-400 group-hover:text-white transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
