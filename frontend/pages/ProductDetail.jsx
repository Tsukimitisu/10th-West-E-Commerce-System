import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Heart, Star, ChevronRight, Minus, Plus, Share2, Truck, Shield, RotateCcw, Package, Check, Info, Link as LinkIcon, MessageCircle } from 'lucide-react';
import { getProductById, getRelatedProducts, getProductReviews, addReview, addToWishlist, removeFromWishlist, getWishlist, recordProductView, WISHLIST_SYNC_EVENT } from '../services/api';
import { useCart } from '../context/CartContext';
import ProductCard from '../components/ProductCard';
import StarRating from '../components/StarRating';
import ReviewCard from '../components/ReviewCard';

const BUY_NOW_SESSION_KEY = 'shopCoreBuyNowSession';
const PRODUCT_IMAGE_FALLBACK = 'https://via.placeholder.com/600?text=No+Image';
const DEFAULT_SHARE_METADATA = {
  title: '10th West Moto Parts',
  description: 'Shop motorcycle parts, accessories, and riding essentials from 10th West Moto.',
  image: '/logo.png',
  url: '/',
  type: 'website',
};
const REVIEW_MAX_MEDIA_FILES = 4;
const REVIEW_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REVIEW_MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const toAbsoluteUrl = (value) => {
  if (!value) return '';

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
};

const truncateText = (value, limit) => {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

const setMetaTag = (attribute, key, content) => {
  if (typeof document === 'undefined') return;

  let tag = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const applyPageMetadata = ({ title, description, image, url, type = 'website' }) => {
  if (typeof document === 'undefined') return;

  document.title = title;
  setMetaTag('name', 'description', description);
  setMetaTag('property', 'og:type', type);
  setMetaTag('property', 'og:site_name', '10th West Moto');
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:image', image);
  setMetaTag('property', 'og:url', url);
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', description);
  setMetaTag('name', 'twitter:image', image);
};

const writeTextToClipboard = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Copy command was rejected.');
    }
  } finally {
    document.body.removeChild(textArea);
  }
};
const normalizeWishlistIds = (items = []) => (
  items
    .map((item) => Number(item.product_id ?? item.product?.id ?? item.id))
    .filter(Boolean)
);

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState('description');
  const [wishlistedIds, setWishlistedIds] = useState([]);
  const [addedToCart, setAddedToCart] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState({ color: '' });
  const [variantError, setVariantError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: '' });
  const [reviewMediaFiles, setReviewMediaFiles] = useState([]);
  const [reviewMediaError, setReviewMediaError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [reviewFieldErrors, setReviewFieldErrors] = useState({});
  const { addToCart } = useCart();

  const user = localStorage.getItem('shopCoreUser');
  const currentUser = user ? JSON.parse(user) : null;
  const userId = currentUser?.id ?? null;
  const isWishlisted = wishlistedIds.includes(Number(id));

  useEffect(() => {
    const loadWishlist = async () => {
      const storedUser = JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
      if (!storedUser?.id) {
        setWishlistedIds([]);
        return;
      }

      try {
        const items = await getWishlist(storedUser.id);
        setWishlistedIds(normalizeWishlistIds(items));
      } catch {
        setWishlistedIds([]);
      }
    };

    loadWishlist();

    const syncWishlist = () => {
      loadWishlist();
    };

    window.addEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
    window.addEventListener('focus', syncWishlist);
    window.addEventListener('storage', syncWishlist);
    return () => {
      window.removeEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
      window.removeEventListener('focus', syncWishlist);
      window.removeEventListener('storage', syncWishlist);
    };
  }, [userId]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const loadProduct = async () => {
      try {
        const p = await getProductById(Number(id));
        setProduct(p);
        setSelectedImage(0);
        setShareOpen(false);
        setShareMessage(null);
        setReviewForm({ rating: 0, comment: '' });
        setReviewMediaFiles([]);
        setReviewMediaError('');
        setReviewError('');
        setReviewSuccess('');
        setReviewFieldErrors({});
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
        window.dispatchEvent(new Event('recentlyViewedUpdated'));

        recordProductView(Number(id)).catch(() => {});
      } catch {}
      setLoading(false);
    };
    loadProduct();
  }, [id]);

  const hasVariants = product && Array.isArray(product.variants) && product.variants.length > 0;
  const shareUrl = product
    ? `${window.location.origin}${window.location.pathname}${window.location.search}#/products/${product.id}`
    : `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const shareTitle = product ? `${product.name} | 10th West Moto` : DEFAULT_SHARE_METADATA.title;
  const shareDescription = product
    ? truncateText(
      product.description || `${product.category_name || 'Motorcycle part'} available now at 10th West Moto.`,
      160,
    )
    : DEFAULT_SHARE_METADATA.description;
  const shareImage = product
    ? toAbsoluteUrl(product.image || DEFAULT_SHARE_METADATA.image)
    : toAbsoluteUrl(DEFAULT_SHARE_METADATA.image);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!shareMessage) return undefined;

    const timer = window.setTimeout(() => {
      setShareMessage(null);
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [shareMessage]);

  useEffect(() => {
    if (!reviewSuccess) return undefined;

    const timer = window.setTimeout(() => {
      setReviewSuccess('');
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [reviewSuccess]);

  useEffect(() => {
    if (!shareOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-share-menu]')) return;
      setShareOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShareOpen(false);
      }
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [shareOpen]);

  useEffect(() => {
    if (!product) {
      applyPageMetadata({
        ...DEFAULT_SHARE_METADATA,
        image: toAbsoluteUrl(DEFAULT_SHARE_METADATA.image),
        url: toAbsoluteUrl(DEFAULT_SHARE_METADATA.url),
      });
      return undefined;
    }

    applyPageMetadata({
      title: shareTitle,
      description: shareDescription,
      image: shareImage,
      url: shareUrl,
      type: 'product',
    });

    return () => {
      applyPageMetadata({
        ...DEFAULT_SHARE_METADATA,
        image: toAbsoluteUrl(DEFAULT_SHARE_METADATA.image),
        url: toAbsoluteUrl(DEFAULT_SHARE_METADATA.url),
      });
    };
  }, [product, shareDescription, shareImage, shareTitle, shareUrl]);

  const showShareFeedback = (type, message) => {
    setShareMessage({ type, message });
  };

  const validateSelection = () => {
    if (!product) return false;
    if (hasVariants && !selectedVariant.color) {
      setVariantError('Please select a color before adding this item to cart.');
      return false;
    }
    const maxStock = Math.max(0, Number(product.stock_quantity ?? 0));
    if (quantity > maxStock) {
      setQuantityError(`Maximum available quantity is ${maxStock}.`);
      return false;
    }
    setVariantError('');
    setQuantityError('');
    return true;
  };

  const addCurrentSelectionToCart = async (showAddedState = true) => {
    if (!product) return false;
    if (!validateSelection()) return false;

    const added = await addToCart(product, quantity);
    if (added === false) return false;

    if (showAddedState) {
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }
    return true;
  };

  const handleAddToCart = async () => {
    await addCurrentSelectionToCart(true);
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!validateSelection()) return;

    const maxStock = Math.max(0, Number(product.stock_quantity ?? 0));
    if (quantity > maxStock) {
      setQuantityError(`Maximum available quantity is ${maxStock}.`);
      return;
    }

    const buyNowSession = {
      sessionId: `${product.id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      returnPath: `/products/${product.id}`,
      item: {
        productId: product.id,
        product,
        quantity,
      },
    };

    sessionStorage.setItem(BUY_NOW_SESSION_KEY, JSON.stringify(buyNowSession));

    const user = localStorage.getItem('shopCoreUser');
    if (!user) {
      navigate('/login?redirect=/checkout&buyNow=1');
    } else {
      navigate('/checkout?buyNow=1', { state: { buyNowSessionId: buyNowSession.sessionId } });
    }
  };

  const handleWishlist = async () => {
    if (!product) return;
    if (!userId) return;
    try {
      const normalizedProductId = Number(product.id);
      if (isWishlisted) await removeFromWishlist(userId, normalizedProductId);
      else await addToWishlist(userId, normalizedProductId);
      setWishlistedIds((prev) => {
        const exists = prev.includes(normalizedProductId);
        if (exists) return prev.filter((wishlistId) => wishlistId !== normalizedProductId);
        return [...prev, normalizedProductId];
      });
    } catch {}
  };

  const handleWishlistToggle = (productId, shouldBeWishlisted) => {
    const normalizedId = Number(productId);
    if (!normalizedId) return;

    setWishlistedIds((prev) => {
      const exists = prev.includes(normalizedId);
      if (shouldBeWishlisted && !exists) return [...prev, normalizedId];
      if (!shouldBeWishlisted && exists) return prev.filter((wishlistId) => wishlistId !== normalizedId);
      return prev;
    });
  };

  const copyShareLink = async () => {
    try {
      await writeTextToClipboard(shareUrl);
      setShareOpen(false);
      showShareFeedback('success', 'Product link copied to clipboard.');
    } catch {
      showShareFeedback('error', 'Unable to copy the link right now.');
    }
  };

  const handleNativeShare = async () => {
    if (!product) return;
    if (!canNativeShare) {
      await copyShareLink();
      return;
    }

    try {
      await navigator.share({
        title: shareTitle,
        text: shareDescription,
        url: shareUrl,
      });
      setShareOpen(false);
      showShareFeedback('success', 'Share sheet opened successfully.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      showShareFeedback('error', 'Unable to open the device share sheet.');
    }
  };

  const openSocialShare = (platform) => {
    if (!product) return;

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(`${product.name} - ${shareDescription}`);
    const shareTargets = {
      facebook: {
        url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        label: 'Facebook',
      },
      whatsapp: {
        url: `https://wa.me/?text=${encodeURIComponent(`${product.name} ${shareUrl}`)}`,
        label: 'WhatsApp',
      },
      x: {
        url: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        label: 'X',
      },
    };

    const target = shareTargets[platform];
    if (!target) return;

    window.open(target.url, '_blank', 'noopener,noreferrer,width=640,height=720');
    setShareOpen(false);
    showShareFeedback('success', `${target.label} share opened in a new tab.`);
  };

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    if (!product || !userId) {
      setReviewError('Please log in to leave a review.');
      return;
    }

    setReviewSubmitting(true);
    setReviewMediaError('');
    setReviewError('');
    setReviewSuccess('');
    setReviewFieldErrors({});

    try {
      const response = await addReview({
        product_id: product.id,
        rating: reviewForm.rating,
        comment: reviewForm.comment.trim(),
        media: reviewMediaFiles,
      });

      setReviewForm({ rating: 0, comment: '' });
      setReviewMediaFiles([]);
      setReviewSuccess(response?.message || 'Review submitted successfully.');
      const latestReviews = await getProductReviews(product.id).catch(() => reviews);
      if (response?.review?.id) {
        const submittedReview = {
          ...response.review,
          user_name: currentUser?.name || 'You',
          user_avatar: currentUser?.avatar || null,
          is_mine: true,
        };
        const hasSubmitted = latestReviews.some((item) => Number(item.id) === Number(submittedReview.id));
        setReviews(hasSubmitted ? latestReviews : [submittedReview, ...latestReviews]);
      } else {
        setReviews(latestReviews);
      }
    } catch (error) {
      setReviewFieldErrors(error?.fieldErrors || {});
      if (error?.fieldErrors?.media) {
        setReviewMediaError(error.fieldErrors.media);
      }
      setReviewError(error?.message || 'Failed to submit your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReviewMediaChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const dedupedFiles = [];
    const seen = new Set();
    [...reviewMediaFiles, ...selectedFiles].forEach((file) => {
      const key = `${file.name}::${file.size}::${file.lastModified}`;
      if (seen.has(key)) return;
      seen.add(key);
      dedupedFiles.push(file);
    });

    const combined = dedupedFiles;
    if (combined.length > REVIEW_MAX_MEDIA_FILES) {
      setReviewMediaError(`You can attach up to ${REVIEW_MAX_MEDIA_FILES} files only.`);
      return;
    }

    for (const file of combined) {
      const mime = String(file.type || '').toLowerCase();
      const fileSize = Number(file.size || 0);
      if (mime.startsWith('image/') && fileSize > REVIEW_MAX_IMAGE_BYTES) {
        setReviewMediaError('Each image must be 5 MB or smaller.');
        return;
      }
      if (mime.startsWith('video/') && fileSize > REVIEW_MAX_VIDEO_BYTES) {
        setReviewMediaError('Each video must be 25 MB or smaller.');
        return;
      }
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
        setReviewMediaError('Only image and video files are supported.');
        return;
      }
    }

    setReviewMediaError('');
    setReviewFieldErrors((prev) => ({ ...prev, media: '' }));
    setReviewMediaFiles(combined);
  };

  const removeReviewMediaFile = (index) => {
    setReviewMediaFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
    setReviewMediaError('');
    setReviewFieldErrors((prev) => ({ ...prev, media: '' }));
  };

  const formatReviewFileSize = (value) => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getReviewFileTypeLabel = (file) => {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('video/')) return 'Video';
    if (mime.startsWith('image/')) return 'Image';
    return 'File';
  };

  const selectedReviewMediaCount = reviewMediaFiles.length;
  const remainingReviewMediaSlots = Math.max(0, REVIEW_MAX_MEDIA_FILES - selectedReviewMediaCount);

  const formatPrice = (p) => `\u20B1${p.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

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

  if (!product) return <div className="text-center py-20 text-gray-600">Product not found.</div>;

  const images = [product.image || PRODUCT_IMAGE_FALLBACK];
  const maxStock = Math.max(0, Number(product.stock_quantity ?? 0));
  const isOutOfStock = maxStock <= 0;
  const hasDiscount = product.is_on_sale && product.sale_price;
  const currentPrice = hasDiscount ? product.sale_price : product.price;

  const colors = hasVariants ? product.variants.map(v => v.color || v.name).filter(Boolean) : [];

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : product.rating || 0;
  const ratingDist = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length ? Math.round((reviews.filter(r => r.rating === star).length / reviews.length) * 100) : 0
  }));

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#f8fafc',
        backgroundImage: `
          radial-gradient(circle at 8% 14%, rgba(239, 68, 68, 0.10) 0%, transparent 34%),
          radial-gradient(circle at 92% 6%, rgba(30, 41, 59, 0.08) 0%, transparent 28%),
          linear-gradient(140deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.92) 42%, rgba(226, 232, 240, 0.85) 100%)
        `,
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-2 text-sm text-gray-700 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl px-4 py-3 shadow-lg">
          <Link to="/" className="hover:text-red-500 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <Link to="/shop" className="hover:text-red-500 transition-colors">Shop</Link>
          <ChevronRight size={14} />
          {product.category_name && <><Link to={`/shop?category=${product.category_id}`} className="hover:text-red-500 transition-colors">{product.category_name}</Link><ChevronRight size={14} /></>}
          <span className="text-gray-900 font-medium line-clamp-1">{product.name}</span>
        </div>
      </div>

      {/* Product Section */}
      <div className="max-w-7xl mx-auto px-4 pb-16 pt-4">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-5 md:p-8 shadow-lg">
          {/* Images */}
          <div className="space-y-3">
            <div className="aspect-square bg-white/50 rounded-2xl overflow-hidden zoom-container relative border border-white/40">
              <img src={images[selectedImage]} alt={product.name} className="w-full h-full object-cover" />
              {hasDiscount && (
                <span className="absolute top-4 left-4 bg-red-500/100 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
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
                  <button key={i} onClick={() => setSelectedImage(i)} className={`w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${i === selectedImage ? 'border-red-500' : 'border-white/50 hover:border-red-200'}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {product.category_name && <span className="text-sm font-semibold text-red-500 uppercase tracking-wide">{product.category_name}</span>}
            <h1 className="font-display font-bold text-2xl lg:text-3xl text-black mt-1 mb-3">{product.name}</h1>

            {/* Rating */}
            <div className="flex items-center gap-3 mb-4">
              <StarRating rating={avgRating} count={reviews.length || product.reviewCount} size={18} />
              <button onClick={() => setActiveTab('reviews')} className="text-sm text-red-500 hover:underline">{reviews.length || product.reviewCount || 0} reviews</button>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6">
              {hasDiscount ? (
                <>
                  <span className="text-3xl font-bold text-red-500">{formatPrice(product.sale_price)}</span>
                  <span className="text-lg text-gray-400 line-through">{formatPrice(product.price)}</span>
                </>
              ) : (
                <span className="text-3xl font-bold text-gray-900">{formatPrice(product.price)}</span>
              )}
            </div>

            {/* Stock indicator */}
            <div className="flex items-center gap-2 mb-6">
              {isOutOfStock ? (
                <span className="flex items-center gap-1.5 text-sm text-red-500 font-medium"><Info size={16} /> Out of stock</span>
              ) : product.stock_quantity <= (product.low_stock_threshold || 5) ? (
                <span className="flex items-center gap-1.5 text-sm text-amber-600 font-medium"><Info size={16} /> Only {product.stock_quantity} left in stock</span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium"><Check size={16} /> In Stock</span>
              )}
            </div>
            <p className="text-xs text-gray-500 -mt-4 mb-6">Stock level: {Math.max(0, Number(product.stock_quantity ?? 0))}</p>

            {/* SKU / Barcode */}
            {(product.sku || product.barcode || product.partNumber) && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-6 pb-6 border-b border-white/40">
                {product.sku && <span>SKU: <strong className="text-gray-800">{product.sku}</strong></span>}
                {product.partNumber && <span>Part#: <strong className="text-gray-800">{product.partNumber}</strong></span>}
                {product.barcode && <span>Barcode: <strong className="text-gray-800">{product.barcode}</strong></span>}
                {product.brand && <span>Brand: <strong className="text-gray-800">{product.brand}</strong></span>}
              </div>
            )}

            {/* Variants */}
            {colors.length > 0 && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">Color <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {colors.map(c => (
                    <button key={c} onClick={() => { setSelectedVariant(prev => ({...prev, color: c})); setVariantError(''); }}
                      className={`px-4 py-2 border rounded-lg text-sm transition-colors ${selectedVariant.color === c ? 'border-red-500 bg-red-500/10 text-red-600' : 'border-white/50 text-gray-700 hover:border-red-200'}`}
                    >{c}</button>
                  ))}
                </div>
                {variantError && <p className="text-xs text-red-500 mt-2">{variantError}</p>}
              </div>
            </div>
            )}

            {/* Quantity & Actions */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex items-center border border-white/50 rounded-lg bg-white/25 backdrop-blur-sm">
                <button onClick={() => { setQuantity(q => Math.max(1, q - 1)); setQuantityError(''); }} className="px-3 py-3 text-gray-600 hover:text-gray-900 hover:bg-white/40 transition-colors" disabled={quantity <= 1}><Minus size={16} /></button>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  pattern="[0-9]*"
                  value={quantity} 
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    if (rawVal === '') {
                      setQuantity('');
                      return;
                    }
                    let val = parseInt(rawVal, 10);
                    if (isNaN(val)) return;
                    
                    const maxQty = 50;
                    let errorMsg = '';
                    
                    if (val < 1) val = 1;
                    if (val > maxQty) {
                      val = maxQty;
                      errorMsg = `Maximum quantity limit is ${maxQty}.`;
                    }
                    if (val > maxStock) {
                      val = maxStock;
                      errorMsg = `Maximum available quantity is ${maxStock}.`;
                    }
                    
                    setQuantity(val);
                    setQuantityError(errorMsg);
                  }}
                  onBlur={() => {
                    if (quantity === '' || isNaN(parseInt(quantity, 10))) {
                      setQuantity(1);
                      setQuantityError('');
                    }
                  }}
                  className="w-12 text-center font-medium bg-transparent text-gray-900 focus:outline-none focus:bg-white/40 py-1 transition-colors" 
                />
                <button
                  onClick={() => {
                    setQuantity((q) => {
                      const maxQty = 50;
                      if (q >= maxQty) {
                        setQuantityError(`Maximum quantity limit is ${maxQty}.`);
                        return maxQty;
                      }
                      if (q >= maxStock) {
                        setQuantityError(`Maximum available quantity is ${maxStock}.`);
                        return maxStock;
                      }
                      setQuantityError('');
                      return q + 1;
                    });
                  }}
                  className="px-3 py-3 text-gray-600 hover:text-gray-900 hover:bg-white/40 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="h-12 w-12 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center justify-center"
                title="Add to cart"
              >
                {addedToCart ? <Check size={18} /> : <ShoppingCart size={18} />}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                className="flex-1 py-3 border border-white/50 bg-white/20 hover:bg-white/35 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-lg transition-all"
              >
                Buy Now
              </button>
              <button onClick={handleWishlist} className={`p-3 border rounded-lg transition-colors ${isWishlisted ? 'border-red-200 bg-red-500/10 text-red-500' : 'border-white/50 bg-white/20 text-gray-700 hover:text-red-500 hover:border-red-200'}`}>
                <Heart size={20} className={isWishlisted ? 'fill-orange-500' : ''} />
              </button>
              <div className="relative" data-share-menu>
                <button
                  type="button"
                  onClick={() => setShareOpen((open) => !open)}
                  className={`p-3 border rounded-lg transition-colors ${shareOpen ? 'border-red-200 bg-red-500/10 text-red-500' : 'border-white/50 bg-white/20 text-gray-700 hover:text-gray-900 hover:border-red-200'}`}
                  aria-label="Share product"
                  aria-expanded={shareOpen}
                >
                  <Share2 size={20} />
                </button>
                {shareOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 text-left text-white shadow-2xl">
                    <div className="border-b border-slate-800 px-3 py-2">
                      <p className="text-sm font-semibold text-white">Share this product</p>
                      <p className="text-xs text-slate-300">Send the link directly or open a social share target.</p>
                    </div>
                    <div className="py-2">
                      {canNativeShare && (
                        <button type="button" onClick={handleNativeShare} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-100 transition-colors hover:bg-slate-800/90">
                          <Share2 size={16} className="text-red-400" />
                          <span>Share via device</span>
                        </button>
                      )}
                      <button type="button" onClick={copyShareLink} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-100 transition-colors hover:bg-slate-800/90">
                        <LinkIcon size={16} className="text-sky-300" />
                        <span>Copy product link</span>
                      </button>
                      <button type="button" onClick={() => openSocialShare('facebook')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-100 transition-colors hover:bg-slate-800/90">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">f</span>
                        <span>Share to Facebook</span>
                      </button>
                      <button type="button" onClick={() => openSocialShare('whatsapp')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-100 transition-colors hover:bg-slate-800/90">
                        <MessageCircle size={16} className="text-green-400" />
                        <span>Share to WhatsApp</span>
                      </button>
                      <button type="button" onClick={() => openSocialShare('x')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-100 transition-colors hover:bg-slate-800/90">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900">X</span>
                        <span>Share to X</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {shareMessage && (
              <p className={`mb-4 text-sm ${shareMessage.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                {shareMessage.message}
              </p>
            )}
            {quantityError && <p className="text-xs text-red-500 -mt-4 mb-6">{quantityError}</p>}

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-white/25 backdrop-blur-sm border border-white/40 rounded-xl">
              <div className="text-center">
                <Truck size={20} className="mx-auto text-gray-700 mb-1" />
                <p className="text-xs text-gray-800 font-medium">Free Shipping</p>
                <p className="text-[10px] text-gray-600">Orders \u20B12,500+</p>
              </div>
              <div className="text-center border-x border-white/40">
                <Shield size={20} className="mx-auto text-gray-700 mb-1" />
                <p className="text-xs text-gray-800 font-medium">Warranty</p>
                <p className="text-[10px] text-gray-600">100% authentic</p>
              </div>
              <div className="text-center">
                <RotateCcw size={20} className="mx-auto text-gray-700 mb-1" />
                <p className="text-xs text-gray-800 font-medium">Easy Returns</p>
                <p className="text-[10px] text-gray-600">7-day return</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-5 md:p-8 shadow-lg">
          <div className="flex gap-1 border-b border-white/40 mb-8">
            {(['description', 'specs', 'reviews']).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-red-500 text-red-500' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
              >{tab === 'reviews' ? `Reviews (${reviews.length || product.reviewCount || 0})` : tab}</button>
            ))}
          </div>

          {activeTab === 'description' && (
            <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed animate-fade-in">
              <p>{product.description || 'No description available for this product.'}</p>
              {product.category_name && (
                <div className="mt-6 p-4 bg-white/25 backdrop-blur-sm border border-white/40 rounded-xl">
                  <h4 className="font-display font-semibold text-gray-900 mb-2 flex items-center gap-2"><Package size={16} /> Motorcycle Compatibility</h4>
                  <p className="text-sm">Compatible with: <strong>{product.category_name}</strong></p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="animate-fade-in">
              <div className="bg-white/25 backdrop-blur-sm border border-white/40 rounded-xl overflow-hidden">
                {[
                  ['Part Number', product.partNumber],
                  ['SKU', product.sku],
                  ['Barcode', product.barcode],
                  ['Brand', product.brand],
                  ['Category', product.category_name],
                  ['Box Number', product.boxNumber],
                  ['Stock Quantity', String(product.stock_quantity)],
                ].filter(([, v]) => v).map(([label, value], i) => (
                  <div key={label} className={`flex justify-between px-5 py-3 text-sm ${i % 2 === 0 ? 'bg-white/20' : 'bg-white/35'}`}>
                    <span className="text-gray-700 font-medium">{label}</span>
                    <span className="text-gray-900 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="animate-fade-in">
              <div className="mb-8 rounded-2xl border border-white/40 bg-white/25 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-gray-900">Write a review</h3>
                    <p className="text-sm text-gray-600">Share your experience with this product. Reviews are moderated before they go live.</p>
                  </div>
                  {!userId && (
                    <Link to="/login" className="text-sm font-medium text-red-500 hover:text-red-600">
                      Log in to review
                    </Link>
                  )}
                </div>

                <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">Your rating</label>
                    <StarRating
                      rating={reviewForm.rating}
                      size={20}
                      interactive={!!userId}
                      onChange={(rating) => {
                        setReviewForm((prev) => ({ ...prev, rating }));
                        setReviewFieldErrors((prev) => ({ ...prev, rating: '' }));
                      }}
                    />
                    {reviewFieldErrors.rating && <p className="mt-2 text-xs text-red-500">{reviewFieldErrors.rating}</p>}
                  </div>

                  <div>
                    <label htmlFor="review-comment" className="mb-2 block text-sm font-medium text-gray-900">Your review</label>
                    <textarea
                      id="review-comment"
                      rows={4}
                      value={reviewForm.comment}
                      onChange={(event) => {
                        setReviewForm((prev) => ({ ...prev, comment: event.target.value }));
                        setReviewFieldErrors((prev) => ({ ...prev, comment: '' }));
                      }}
                      disabled={!userId || reviewSubmitting}
                      placeholder="Describe the product quality, fit, or overall experience."
                      className="w-full rounded-xl border border-white/50 bg-white/70 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:bg-gray-100"
                    />
                    {reviewFieldErrors.comment && <p className="mt-2 text-xs text-red-500">{reviewFieldErrors.comment}</p>}
                  </div>

                  <div>
                    <label htmlFor="review-media" className="mb-2 block text-sm font-medium text-gray-900">
                      Photos or videos (optional)
                    </label>
                    <label
                      htmlFor="review-media"
                      className={`block w-full rounded-xl border-2 border-dashed px-4 py-4 transition ${(!userId || reviewSubmitting) ? 'cursor-not-allowed border-gray-300 bg-gray-100' : 'cursor-pointer border-red-200 bg-white/80 hover:border-red-300 hover:bg-white'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">Tap to add photos or videos</p>
                          <p className="mt-1 text-xs text-gray-600">
                            {selectedReviewMediaCount} selected. {remainingReviewMediaSlots} slot{remainingReviewMediaSlots !== 1 ? 's' : ''} remaining.
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white">
                          Choose files
                        </span>
                      </div>
                    </label>
                    <input
                      id="review-media"
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      disabled={!userId || reviewSubmitting}
                      onChange={handleReviewMediaChange}
                      className="sr-only"
                    />
                    <p className="mt-2 text-xs text-gray-600">
                      You can attach up to {REVIEW_MAX_MEDIA_FILES} files per review. Image limit: 5 MB each. Video limit: 25 MB each.
                    </p>
                    {(reviewFieldErrors.media || reviewMediaError) && (
                      <p className="mt-2 text-xs text-red-500">{reviewFieldErrors.media || reviewMediaError}</p>
                    )}

                    {reviewMediaFiles.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {reviewMediaFiles.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="rounded-xl border border-white/50 bg-white/70 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-gray-900">{file.name}</p>
                                <p className="mt-1 text-[11px] text-gray-600">
                                  {getReviewFileTypeLabel(file)} - {formatReviewFileSize(file.size)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeReviewMediaFile(index)}
                                className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {reviewError && <p className="text-sm text-red-500">{reviewError}</p>}
                  {reviewSuccess && <p className="text-sm text-green-600">{reviewSuccess}</p>}

                  <button
                    type="submit"
                    disabled={!userId || reviewSubmitting}
                    className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {reviewSubmitting ? 'Submitting...' : 'Submit review'}
                  </button>
                </form>
              </div>

              {/* Rating summary */}
              <div className="flex flex-col md:flex-row gap-8 mb-8 p-6 bg-white/25 backdrop-blur-sm border border-white/40 rounded-xl">
                <div className="text-center md:text-left">
                  <div className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</div>
                  <StarRating rating={avgRating} size={20} />
                  <p className="text-sm text-gray-600 mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex-1 space-y-2">
                  {ratingDist.map(d => (
                    <div key={d.star} className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 w-6">{d.star}★</span>
                      <div className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-8">{d.count}</span>
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
                <p className="text-center text-gray-400 py-8">No reviews yet. Be the first to review this product!</p>
              )}
            </div>
          )}
        </div>

        {/* Related Productssss */}
        {related.length > 0 && (
          <div className="mt-8 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-5 md:p-8 shadow-lg">
            <h2 className="font-display font-bold text-xl text-gray-900 mb-6">Related Products</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.slice(0, 4).map((relatedProduct) => (
                <ProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                  wishlistedIds={wishlistedIds}
                  onWishlistToggle={handleWishlistToggle}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;


