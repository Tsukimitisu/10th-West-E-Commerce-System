import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Star, Tag, AlertTriangle } from 'lucide-react';
import { addToWishlist, removeFromWishlist, getWishlist } from '../services/api';

const ProductCard = ({ product, wishlistedIds = [], onWishlistToggle, view = 'grid' }) => {
  const [localWishlisted, setLocalWishlisted] = useState(wishlistedIds.includes(product.id));

  useEffect(() => {
    setLocalWishlisted(wishlistedIds.includes(product.id));
  }, [wishlistedIds, product.id]);

  useEffect(() => {
    if (wishlistedIds.length > 0) return;
    const checkWishlist = async () => {
      try {
        const user = localStorage.getItem('shopCoreUser');
        if (!user) return;
        const userId = JSON.parse(user).id;
        const items = await getWishlist(userId);
        setLocalWishlisted(items.some(i => i.product_id === product.id));
      } catch {}
    };
    checkWishlist();
  }, [product.id, wishlistedIds.length]);

  const stockLevel = Math.max(0, Number(product.stock_quantity ?? 0));
  const isOutOfStock = stockLevel <= 0;
  const isLowStock = stockLevel > 0 && stockLevel <= (product.low_stock_threshold || 5);
  const hasDiscount = product.is_on_sale && product.sale_price;
  const discountPercent = hasDiscount ? Math.round((1 - (product.sale_price / product.price)) * 100) : 0;

  const handleWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const user = localStorage.getItem('shopCoreUser');
      if (!user) return;
      const userId = JSON.parse(user).id;
      
      const newStatus = !localWishlisted;
      setLocalWishlisted(newStatus);

      if (!newStatus) await removeFromWishlist(userId, product.id);
      else await addToWishlist(userId, product.id);
      onWishlistToggle?.(product.id, newStatus);
    } catch {
      setLocalWishlisted(!localWishlisted); // Revert on failure
    }
  };

  const formatPrice = (p) => `${'\u20B1'}${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (view === 'list') {
    return (
      <Link to={`/products/${product.id}`} className="group flex gap-4 bg-gray-100 border border-gray-300 rounded-xl p-4 hover:shadow-md hover:border-red-500 transition-all duration-300">
        <div className="w-32 h-32 flex-shrink-0 bg-gray-300 rounded-lg overflow-hidden relative">
          <img src={product.image || 'https://via.placeholder.com/300?text=No+Image'} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          {isOutOfStock && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><span className="text-xs font-bold text-red-500 bg-gray-800 px-2 py-1 rounded">SOLD OUT</span></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              {product.category_name && <span className="text-xs font-medium text-red-600">{product.category_name}</span>}
              <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors line-clamp-1">{product.name}</h3>
            </div>
            <button onClick={handleWishlist} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0">
              <Heart size={18} className={localWishlisted ? 'text-red-500 fill-orange-500' : 'text-gray-300 hover:text-orange-400'} />
            </button>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mt-1">{product.description}</p>
          <div className="flex items-center gap-2 mt-2">
            {product.rating && <div className="flex items-center gap-1"><Star size={14} className="text-yellow-500 fill-yellow-500" /><span className="text-sm font-medium text-gray-900">{product.rating}</span></div>}
            {product.brand && <span className="text-xs text-gray-600">- {product.brand}</span>}
            <span className="text-xs text-gray-600">Stock: {stockLevel}</span>
            {isLowStock && <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> Low stock</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {hasDiscount ? (
              <>
                <span className="font-bold text-red-600">{formatPrice(product.sale_price)}</span>
                <span className="text-sm text-gray-600 line-through">{formatPrice(product.price)}</span>
                <span className="text-xs font-semibold text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">-{discountPercent}%</span>
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
    <Link to={`/products/${product.id}`} className="group bg-gray-100 border border-gray-300 rounded-xl overflow-hidden hover:shadow-lg hover:border-red-500 transition-all duration-300">
      <div className="relative aspect-square bg-gray-200 overflow-hidden">
        <img
          src={product.image || 'https://via.placeholder.com/300?text=No+Image'}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasDiscount && (
            <span className="bg-red-500/100 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1"><Tag size={10} /> -{discountPercent}%</span>
          )}
          {isLowStock && !isOutOfStock && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md">Low Stock</span>
          )}
        </div>
        <button onClick={handleWishlist} className="absolute top-2 right-2 p-2 bg-gray-900/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-red-500 hover:scale-110 transition-all">
          <Heart size={16} className={localWishlisted ? 'text-red-500 fill-orange-500' : 'text-gray-400'} />
        </button>
        {isOutOfStock && (
          <div className="absolute inset-0 bg-gray-400/60 flex items-center justify-center">
            <span className="bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg">SOLD OUT</span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-center justify-between mb-1">
          {product.category_name && <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">{product.category_name}</span>}
          {product.brand && <span className="text-[11px] text-gray-600">{product.brand}</span>}
        </div>
        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-red-600 transition-colors line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        {product.rating !== undefined && (
          <div className="flex items-center gap-1 mt-1.5">
            <Star size={13} className="text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-medium text-gray-900">{product.rating}</span>
            {product.reviewCount !== undefined && <span className="text-xs text-gray-600">({product.reviewCount})</span>}
          </div>
        )}
        <p className="text-xs text-gray-600 mt-1">Stock: {stockLevel}</p>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-2">
            {hasDiscount ? (
              <>
                <span className="font-bold text-red-600">{formatPrice(product.sale_price)}</span>
                <span className="text-xs text-gray-600 line-through">{formatPrice(product.price)}</span>
              </>
            ) : (
              <span className="font-bold text-gray-900">{formatPrice(product.price)}</span>
            )}
          </div>
          {isLowStock && <span className="text-[11px] text-amber-600 font-medium">Low stock</span>}
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;


