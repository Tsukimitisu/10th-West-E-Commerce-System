export const PRODUCT_IMAGE_FALLBACK = '/images/product-fallback.svg';

const BLOCKED_PRODUCT_IMAGE_HOSTS = new Set([
  'images.unsplash.com',
  'source.unsplash.com',
  'plus.unsplash.com',
]);

export const isBlockedProductImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;

  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
    const parsed = new URL(raw, baseUrl);
    return BLOCKED_PRODUCT_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const resolveProductImageUrl = (value, fallback = PRODUCT_IMAGE_FALLBACK) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return isBlockedProductImageUrl(raw) ? fallback : raw;
};

export const handleProductImageError = (event, fallback = PRODUCT_IMAGE_FALLBACK) => {
  const image = event.currentTarget;
  if (!image || image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  image.src = fallback;
};
