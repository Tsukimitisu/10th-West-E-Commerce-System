export const currentCartUnitPrice = (item) => {
  const product = item?.product || {};
  const salePrice = product.sale_price == null ? NaN : Number(product.sale_price);
  const price = product.is_on_sale && Number.isFinite(salePrice) ? salePrice : Number(product.price);
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : 0;
};

export const detectCartPriceChanges = (cachedItems, currentItems) => {
  const cachedPrices = new Map((Array.isArray(cachedItems) ? cachedItems : []).map((item) => [
    `${item.productId}:${item.variantId || ''}`, currentCartUnitPrice(item),
  ]));

  return (Array.isArray(currentItems) ? currentItems : []).flatMap((item) => {
    const oldPrice = cachedPrices.get(`${item.productId}:${item.variantId || ''}`);
    const currentPrice = currentCartUnitPrice(item);
    return oldPrice !== undefined && oldPrice !== currentPrice
      ? [{ productId: item.productId, name: item.product?.name || 'Item', currentPrice }]
      : [];
  });
};
