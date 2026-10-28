export const ECOMMERCE_MARKUP_RATE = 0.15;

export const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const calculateEcommercePrice = (storeSellingPrice) => {
  const price = Number(storeSellingPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw Object.assign(new Error('Store selling price must be a non-negative number.'), {
      status: 400,
      code: 'INVALID_STORE_SELLING_PRICE',
    });
  }
  return roundCurrency(price * (1 + ECOMMERCE_MARKUP_RATE));
};

export const resolveStoreSellingPrice = (product) => {
  const value = product?.store_selling_price ?? product?.price;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? roundCurrency(price) : null;
};

export const resolveEcommercePrice = (product) => {
  const storePrice = resolveStoreSellingPrice(product);
  return storePrice == null ? null : calculateEcommercePrice(storePrice);
};
