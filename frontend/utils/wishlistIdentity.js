export const isSetWishlistItem = item => item?.reference_type === 'storefront_set';
export const wishlistKey = item => isSetWishlistItem(item)
  ? `set:${item.listing_id}` : `product:${item.product_id ?? item.product?.id ?? item.id}`;
export const getWishlistProductIds = (items = []) => items.filter(item => !isSetWishlistItem(item))
  .map(item => Number(item.product_id ?? item.product?.id ?? item.id)).filter(Boolean);
