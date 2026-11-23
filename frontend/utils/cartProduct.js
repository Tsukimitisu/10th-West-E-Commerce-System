export const cartProductId = product => Number(product?.product_id ?? product?.inventory_item_id ?? product?.id);
export const cartVariantId = product => product?.selected_variant?.id ?? product?.variant_id ?? null;

export const availableStock = product => {
  if (!product || product.is_deleted || ['inactive', 'discontinued'].includes(product.inventory_status)) return 0;
  if (product.selected_variant) return availableStock(product.selected_variant);
  if (product.available_stock != null) return Math.max(0, Number(product.available_stock) || 0);
  if (Array.isArray(product.variants) && product.variants.length) return product.variants.reduce((sum, variant) => sum + availableStock(variant), 0);
  return Math.max(0, (Number(product.stock_quantity) || 0) - (Number(product.reserved_stock) || 0));
};

export const cartAddPayload = (product, quantity, options = {}) => ({
  product_id: cartProductId(product), variant_id: cartVariantId(product), quantity: Number(quantity),
  ...(options.listingId ? { listing_id: options.listingId } : {}),
});
