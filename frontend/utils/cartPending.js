// Add-to-cart pending state is keyed per product/variant (and set listing),
// never global, so one click cannot make every card look busy.
export const cartPendingKey = (productId, variantId = null, listingId = null) => (
  `${listingId ? `set:${listingId}:` : ''}${Number(productId) || 0}:${Number(variantId) || 0}`
);

// Synchronous guard: a second click on the same key while the first request is
// in flight is rejected before any cart mutation starts.
export const createPendingGuard = (onChange = () => {}) => {
  const keys = new Set();
  return {
    start(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      onChange(new Set(keys));
      return true;
    },
    finish(key) {
      keys.delete(key);
      onChange(new Set(keys));
    },
    has: (key) => keys.has(key),
  };
};

export const runWithPendingKey = async (guard, key, task) => {
  if (!guard.start(key)) return false;
  try {
    return await task();
  } finally {
    guard.finish(key);
  }
};
