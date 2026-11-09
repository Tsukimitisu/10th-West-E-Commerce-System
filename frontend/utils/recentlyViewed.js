import { availableStock } from './cartProduct.js';

const KEY = 'recentlyViewed';
export const RECENTLY_VIEWED_EVENT = 'recentlyViewedUpdated';
export const normalizeRecentlyViewedIds = entries => {
  if (!Array.isArray(entries)) return [];
  const ids = entries.map(entry => typeof entry === 'object' && entry !== null ? entry.id : entry)
    .filter(id => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id.trim())))
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, 10);
};

export function readRecentlyViewedIds(storage) {
  try { return normalizeRecentlyViewedIds(JSON.parse((storage || globalThis.localStorage)?.getItem(KEY) || '[]')); }
  catch { return []; }
}

function saveIds(ids, storage, notify = false) {
  try {
    const target = storage || globalThis.localStorage;
    const value = ids.length ? JSON.stringify(ids) : null;
    if (target?.getItem(KEY) === value) return;
    if (value === null) target?.removeItem(KEY); else target?.setItem(KEY, value);
    if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
  } catch { /* Storage may be unavailable/full; live catalog rendering still works. */ }
}

export const isRecentlyViewedEligible = product => Boolean(product?.id) && !product.is_deleted
  && (product.inventory_status == null || product.inventory_status === 'active')
  && (product.visibility_status == null || product.visibility_status === 'active')
  && !['archived','draft','inactive','discontinued','unpublished','disabled'].includes(product.status)
  && availableStock(product) > 0;

export function reconcileRecentlyViewed(products, storage) {
  const catalog = new Map(products.filter(isRecentlyViewedEligible).map(product => [Number(product.id), product]));
  const ids = readRecentlyViewedIds(storage).filter(id => catalog.has(id));
  saveIds(ids, storage);
  return ids.map(id => catalog.get(id)); // Never return stored snapshots.
}

export function recordRecentlyViewed(id, storage) {
  saveIds(normalizeRecentlyViewedIds([id, ...readRecentlyViewedIds(storage)]), storage, true);
}

export function removeRecentlyViewed(id, storage) {
  saveIds(readRecentlyViewedIds(storage).filter(value => value !== Number(id)), storage, true);
}
