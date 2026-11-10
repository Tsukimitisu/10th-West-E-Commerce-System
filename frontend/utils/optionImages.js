import { isBlockedProductImageUrl, PRODUCT_IMAGE_FALLBACK } from './productImages.js';

export const optionImageSources = (image, cover) => [...new Set([image,cover].filter(value => {
  if (!value || isBlockedProductImageUrl(value)) return false;
  const raw = String(value).trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) return true;
  try { return ['https:','http:'].includes(new URL(raw).protocol); } catch { return false; }
}).map(value => String(value).trim()).concat(PRODUCT_IMAGE_FALLBACK))];
