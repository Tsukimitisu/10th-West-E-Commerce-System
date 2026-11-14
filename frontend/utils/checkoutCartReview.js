const unitPrice = (item) => {
  const product = item?.product || {};
  const value = product.is_on_sale && Number.isFinite(Number(product.sale_price))
    ? Number(product.sale_price)
    : Number(product.price);
  return Math.round(value * 100) / 100;
};

export const getCheckoutCartWarning = (displayedItems, currentItems, { buyNow = false } = {}) => {
  for (const displayed of displayedItems) {
    const current = currentItems.find((item) => Number(item.productId) === Number(displayed.productId)
      && Number(item.variantId || 0) === Number(displayed.variantId || 0));
    if (!current || Number(current.product?.stock_quantity) < Number(displayed.quantity)
      || Number(current.quantity) < Number(displayed.quantity)) {
      return 'Some items are no longer available in the selected quantity. Please review your cart before checkout.';
    }
    if (unitPrice(current) !== unitPrice(displayed)) {
      return buyNow
        ? 'Some item prices have changed. Please return to the product and review its current price.'
        : 'Some item prices have changed. Please review your cart before checkout.';
    }
  }
  return null;
};
