const CUSTOMER_PATH =
  /^\/(?:$|shop(?:[/?#]|$)|products\/[^/]+(?:[/?#]|$)|cart(?:[/?#]|$)|checkout(?:[/?#]|$)|profile(?:[/?#]|$)|orders(?:[/?#]|$)|order-confirmation\/|my-returns(?:[/?#]|$)|addresses(?:[/?#]|$)|wishlist(?:[/?#]|$)|messages(?:[/?#]|$)|payment(?:[/?#-]|$)|payment-result(?:[/?#]|$)|contact(?:[/?#]|$)|faq(?:[/?#]|$)|privacy(?:[/?#]|$)|terms(?:[/?#]|$)|return-policy(?:[/?#]|$))/;
export function safeCustomerReturnTo(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path))
    return "/";
  try {
    const normalized = new URL(path, "https://store.invalid");
    const decodedPath = decodeURIComponent(normalized.pathname);
    if (!CUSTOMER_PATH.test(decodedPath) || /[\\\r\n]/.test(decodedPath))
      return "/";
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return "/";
  }
}
export function customerReturnTo(search) {
  const params = new URLSearchParams(search);
  const target = safeCustomerReturnTo(params.get("redirect"));
  if (target === "/") return target;
  const url = new URL(target, "https://store.invalid");
  // Preserve the existing Buy Now query convention and encoded return paths.
  for (const key of ["buyNow", "productId", "quantity", "variantId", "items"]) {
    if (params.has(key)) url.searchParams.set(key, params.get(key));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
