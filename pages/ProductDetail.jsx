import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, Heart, Star, ChevronRight, Minus, Plus, Share2, Truck, Shield, RotateCcw, Package, Check, Info, ChevronDown } from 'lucide-react';
import { getProductById, getRelatedProducts, getProductReviews, addToWishlist, removeFromWishlist, getWishlist, recordProductView } from '../services/api';
import { useCart } from '../context/CartContext';
import ProductCard from '../components/ProductCard';
import StarRating from '../components/StarRating';
import ReviewCard from '../components/ReviewCard';

const ProductDetail = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState({ color: '', size: '' });
  const { addToCart } = useCart();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const loadProduct = async () => {
      try {
        const p = await getProductById(Number(id));
        setProduct(p);
        const [rel, rev] = await Promise.all([
          getRelatedProducts(Number(id), p.category_id || 0).catch(() => []),
          getProductReviews(Number(id)).catch(() => []),
        ]);
        setRelated(rel);
        setReviews(rev);

        // Save to recently viewed
        const viewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        const updated = [p, ...viewed.filter((v) => v.id !== p.id)].slice(0, 10);
        localStorage.setItem('recentlyViewed', JSON.stringify(updated));

        recordProductView(Number(id)).catch(() => {});
      } catch {}
      setLoading(false);
    };
    loadProduct();

    // Check wishlist
    const user = localStorage.getItem('shopCoreUser');
    if (user) {
      const userId = JSON.parse(user).id;
      getWishlist(userId).then(items => {
        setIsWishlisted(items.some(w => w.product_id === Number(id)));
      }).catch(() => {});
    }
  }, [id]);

  const handleAddToCart = async () => {
    if (!product) return;
    await addToCart(product, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleWishlist = async () => {
    if (!product) return;
    const user = localStorage.getItem('shopCoreUser');
    if (!user) return;
    const userId = JSON.parse(user).id;
    try {
      if (isWishlisted) await removeFromWishlist(userId, product.id);
      else await addToWishlist(userId, product.id);
      setIsWishlisted(!isWishlisted);
    } catch {}
  };

  const formatPrice = (p) => `₱${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-square skeleton rounded-2xl" />
          <div className="space-y-4"><div className="h-6 skeleton rounded w-40" /><div className="h-8 skeleton rounded w-3/4" /><div className="h-10 skeleton rounded w-32" /><div className="h-12 skeleton rounded w-full" /></div>
        </div>
      </div>
    );
  }

  if (!product) return <div className="text-center py-20 text-gray-500">Product not found.</div>;

  const images = [product.image || 'https://via.placeholder.com/600?text=No+Image'];
  const isOutOfStock = product.stock_quantity <= 0;
  const hasDiscount = product.is_on_sale && product.sale_price;
  const currentPrice = hasDiscount ? product.sale_price : product.price;

  const colors = ['Black', 'Silver', 'Red'];
  const sizes = ['S', 'M', 'L', 'XL'];

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : product.rating || 0;
  const ratingDist = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length ? Math.round((reviews.filter(r => r.rating === star).length / reviews.length) * 100) : 0
  }));

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="hover:text-red-600 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <Link to="/shop" className="hover:text-red-600 transition-colors">Shop</Link>
          <ChevronRight size={14} />
          {product.category_name && <><Link to={`/shop?category=${product.category_id}`} className="hover:text-red-600 transition-colors">{product.category_name}</Link><ChevronRight size={14} /></>}
          <span className="text-gray-900 font-medium line-clamp-1">{product.name}</span>
        </div>
      </div>

      {/* Product Section */}
      <div className="max-w-7xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Images */}
          <div className="space-y-3">
            <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden zoom-container relative">
              <img src={images[selectedImage]} alt={product.name} className="w-full h-full object-cover" />
              {hasDiscount && (
                <span className="absolute top-4 left-4 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
                  -{Math.round((1 - product.sale_price / product.price) * 100)}% OFF
                </span>
              )}
              {isOutOfStock && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <span className="bg-gray-900 text-white text-sm font-bold px-6 py-3 rounded-lg">SOLD OUT</span>
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)} className={`w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${i === selectedImage ? 'border-red-600' : 'border-gray-200 hover:border-gray-300'}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {product.category_name && <span className="text-sm font-semibold text-red-600 uppercase tracking-wide">{product.category_name}</span>}
            <h1 className="font-display font-bold text-2xl lg:text-3xl text-gray-900 mt-1 mb-3">{product.name}</h1>

            {/* Rating */}
            <div className="flex items-center gap-3 mb-4">
              <StarRating rating={avgRating} count={reviews.length || product.reviewCount} size={18} />
              <button onClick={() => setActiveTab('reviews')} className="text-sm text-red-600 hover:underline">{reviews.length || product.reviewCount || 0} reviews</button>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6">
              {hasDiscount ? (
                <>
                  <span className="text-3xl font-bold text-red-600">{formatPrice(product.sale_price)}</span>
                  <span className="text-lg text-gray-400 line-through">{formatPrice(product.price)}</span>
                </>
              ) : (
                <span className="text-3xl font-bold text-gray-900">{formatPrice(product.price)}</span>
              )}
            </div>

            {/* Stock indicator */}
            <div className="flex items-center gap-2 mb-6">
              {isOutOfStock ? (
                <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium"><Info size={16} /> Out of stock</span>
              ) : product.stock_quantity <= (product.low_stock_threshold || 5) ? (
                <span className="flex items-center gap-1.5 text-sm text-amber-600 font-medium"><Info size={16} /> Only {product.stock_quantity} left in stock</span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium"><Check size={16} /> In Stock</span>
              )}
            </div>

            {/* SKU / Barcode */}
            {(product.sku || product.barcode || product.partNumber) && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-6 pb-6 border-b border-gray-100">
                {product.sku && <span>SKU: <strong className="text-gray-700">{product.sku}</strong></span>}
                {product.partNumber && <span>Part#: <strong className="text-gray-700">{product.partNumber}</strong></span>}
                {product.barcode && <span>Barcode: <strong className="text-gray-700">{product.barcode}</strong></span>}
                {product.brand && <span>Brand: <strong className="text-gray-700">{product.brand}</strong></span>}
              </div>
            )}

            {/* Variants */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">Color</label>
                <div className="flex gap-2">
                  {colors.map(c => (
                    <button key={c} onClick={() => setSelectedVariant(prev => ({...prev, color: c}))}
                      className={`px-4 py-2 border rounded-lg text-sm transition-colors ${selectedVariant.color === c ? 'border-red-600 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">Size</label>
                <div className="flex gap-2">
                  {sizes.map(s => (
                    <button key={s} onClick={() => setSelectedVariant(prev => ({...prev, size: s}))}
                      className={`w-11 h-11 border rounded-lg text-sm font-medium transition-colors ${selectedVariant.size === s ? 'border-red-600 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >{s}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quantity & Actions */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"><Minus size={16} /></button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"><Plus size={16} /></button>
              </div>
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {addedToCart ? <><Check size={18} /> Added!</> : <><ShoppingCart size={18} /> Add to Cart</>}
              </button>
              <button onClick={handleWishlist} className={`p-3 border rounded-lg transition-colors ${isWishlisted ? 'border-red-200 bg-red-50 text-red-500' : 'border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200'}`}>
                <Heart size={20} className={isWishlisted ? 'fill-red-500' : ''} />
              </button>
              <button className="p-3 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <Share2 size={20} />
              </button>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl">
              <div className="text-center">
                <Truck size={20} className="mx-auto text-gray-600 mb-1" />
                <p className="text-xs text-gray-600 font-medium">Free Shipping</p>
                <p className="text-[10px] text-gray-400">Orders ₱2,500+</p>
              </div>
              <div className="text-center border-x border-gray-200">
                <Shield size={20} className="mx-auto text-gray-600 mb-1" />
                <p className="text-xs text-gray-600 font-medium">Warranty</p>
                <p className="text-[10px] text-gray-400">100% authentic</p>
              </div>
              <div className="text-center">
                <RotateCcw size={20} className="mx-auto text-gray-600 mb-1" />
                <p className="text-xs text-gray-600 font-medium">Easy Returns</p>
                <p className="text-[10px] text-gray-400">7-day return</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12 border-t border-gray-100 pt-8">
          <div className="flex gap-1 border-b border-gray-100 mb-8">
            {(['description', 'specs', 'reviews']).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >{tab === 'reviews' ? `Reviews (${reviews.length || product.reviewCount || 0})` : tab}</button>
            ))}
          </div>

          {activeTab === 'description' && (
            <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed animate-fade-in">
              <p>{product.description || 'No description available for this product.'}</p>
              {product.category_name && (
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-display font-semibold text-gray-900 mb-2 flex items-center gap-2"><Package size={16} /> Motorcycle Compatibility</h4>
                  <p className="text-sm">Compatible with: <strong>{product.category_name}</strong></p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="animate-fade-in">
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                {[
                  ['Part Number', product.partNumber],
                  ['SKU', product.sku],
                  ['Barcode', product.barcode],
                  ['Brand', product.brand],
                  ['Category', product.category_name],
                  ['Box Number', product.boxNumber],
                  ['Stock Quantity', String(product.stock_quantity)],
                ].filter(([, v]) => v).map(([label, value], i) => (
                  <div key={label} className={`flex justify-between px-5 py-3 text-sm ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                    <span className="text-gray-500 font-medium">{label}</span>
                    <span className="text-gray-900 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="animate-fade-in">
              {/* Rating summary */}
              <div className="flex flex-col md:flex-row gap-8 mb-8 p-6 bg-gray-50 rounded-xl">
                <div className="text-center md:text-left">
                  <div className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</div>
                  <StarRating rating={avgRating} size={20} />
                  <p className="text-sm text-gray-500 mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex-1 space-y-2">
                  {ratingDist.map(d => (
                    <div key={d.star} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-6">{d.star}★</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviews list */}
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No reviews yet. Be the first to review this product!</p>
              )}
            </div>
          )}
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="mt-16 pt-8 border-t border-gray-100">
            <h2 className="font-display font-bold text-xl text-gray-900 mb-6">Related Products</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;
