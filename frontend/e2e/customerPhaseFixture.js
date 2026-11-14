// Every API request is intercepted. No business write reaches the shared DB.
export const fixtureProduct = {
  id: 98001,
  name: "Rider 4T Engine Oil",
  price: 500,
  stock_quantity: 8,
  status: "published",
  part_number: "OIL-98001",
  image: "/images/product-fallback.svg",
  brand: "10th West",
  motorcycle_model: "Click 125",
  color: "Standard",
  variants: [],
  description: "<p>Dependable oil for everyday riding.</p>",
  fitments: [
    { brand: "Honda", model: "Click 125", start_year: 2020, end_year: 2026 },
  ],
};
export const fixtureCustomer = {
  id: 700001,
  name: "Test Rider",
  email: "rider@example.test",
  role: "customer",
  email_verified: true,
  is_verified: true,
  phone: "09171234567",
};
export const fixtureBanners = [
  {
    id: 1,
    title: "Maintenance essentials",
    subtitle: "Find oils and replacement parts for your next service.",
    image_url: "/brand/ride-detail.webp",
    button_text: "Shop maintenance",
    link_url: "/shop?search=oil",
    is_active: true,
    display_order: 1,
  },
  {
    id: 2,
    title: "Parts for your Click 125",
    subtitle:
      "Browse parts for your motorcycle. Confirm compatibility before ordering.",
    image_url: "/brand/ride-detail-mobile.webp",
    button_text: "Find Click parts",
    link_url: "/shop?model=Click%20125",
    is_active: true,
    display_order: 2,
  },
];
export function fixtureCart(quantity = 2) {
  return [
    { id: 77001, product_id: 98001, quantity, product: { ...fixtureProduct } },
  ];
}
export const fixtureOrder = {
  id: 88001,
  order_number: "TW-2026-88001",
  user_id: 700001,
  status: "shipped",
  payment_status: "paid",
  payment_method: "gcash",
  created_at: "2026-10-15T08:00:00Z",
  subtotal: 1000,
  shipping_fee: 150,
  total_amount: 1288,
  can_return: true,
  return_window_days: 7,
  items: [
    {
      id: 1,
      product_id: 98001,
      name: fixtureProduct.name,
      quantity: 2,
      price: 500,
      image_url: "/images/product-fallback.svg",
    },
  ],
  shipping_address_snapshot: {
    recipient_name: "Test Rider",
    street: "Sample Street",
    city: "Quezon City",
    state: "Metro Manila",
    postal_code: "1100",
    country: "Philippines",
    phone: "09171234567",
  },
};
export async function customerFixture(page, options = {}) {
  const state = {
    user: options.authenticated ? fixtureCustomer : null,
    product: structuredClone(fixtureProduct),
    cart: structuredClone(options.cart || []),
    accountCart: structuredClone(options.accountCart || []),
    banners: options.banners ?? fixtureBanners,
    announcements: options.announcements || [],
    mergeConfirmed: options.mergeConfirmed !== false,
    orders: options.orders || [],
    notifications: options.notifications || [],
    calls: [],
    writes: [],
  };
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();
    state.calls.push({ path, method });
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    const row = (quantity) => ({
      id: 77001,
      product_id: 98001,
      quantity,
      product: { ...state.product },
    });
    if (method !== "GET") {
      state.writes.push({ path, method });
      if (path === "/auth/login") {
        const quantity = Math.min(
          state.product.stock_quantity,
          [...state.cart, ...state.accountCart].reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
        );
        state.cart = state.mergeConfirmed
          ? quantity
            ? [row(quantity)]
            : []
          : structuredClone(state.accountCart);
        state.user = fixtureCustomer;
        return reply({ user: state.user });
      }
      if (path === "/cart/add") {
        const quantity =
          Number(request.postDataJSON().quantity) +
          (state.cart[0]?.quantity || 0);
        if (quantity > state.product.stock_quantity)
          return reply({ message: "Cannot exceed available stock." }, 400);
        state.cart = [row(quantity)];
        return reply({ success: true });
      }
      if (path.startsWith("/cart/update/")) {
        state.cart = [row(Number(request.postDataJSON().quantity))];
        return reply({ success: true });
      }
      if (path.startsWith("/cart/remove/") || path === "/cart/clear") {
        state.cart = [];
        return reply({ success: true });
      }
      return reply({});
    }
    if (path === "/csrf-token")
      return reply({ csrfToken: "isolated-customer-test-token" });
    if (path.startsWith("/auth/profile")) return reply(state.user);
    if (path === "/auth/providers")
      return reply({
        google: { available: true },
        facebook: { available: true },
      });
    if (path === "/auth/availability") return reply({ available: true });
    if (path === "/cart")
      return reply({
        guest_merge: state.user && state.mergeConfirmed ? "complete" : null,
        items: state.cart.map((item) => ({
          ...item,
          product: { ...state.product },
          is_available: state.product.stock_quantity >= item.quantity,
          warning:
            state.product.stock_quantity < item.quantity
              ? "Quantity exceeds available stock"
              : null,
        })),
      });
    if (path === "/products") return reply([state.product]);
    if (path === "/products/98001") return reply(state.product);
    if (path === "/products/98001/reviews")
      return reply([
        {
          id: 5001,
          user_name: "Alex Rider",
          rating: 5,
          comment:
            "Good fit and clear stock information. Helpful shop support.",
          verified_purchase: true,
          created_at: "2026-10-01T08:00:00Z",
        },
      ]);
    if (path.startsWith("/reviews/eligibility/"))
      return reply({ eligible: false, reason: "no_delivered_order" });
    if (path === "/banners") return reply(state.banners);
    if (path === "/announcements") return reply(state.announcements);
    if (path === "/categories") return reply([{ id: 1, name: "Maintenance" }]);
    if (path.includes("motorcycle-model"))
      return reply({
        models: [
          { id: 1, model_name: "Click 125", brand: "Honda", status: "active" },
        ],
      });
    if (path === "/shipping/config")
      return reply({
        free_shipping_threshold: 3000,
        cod_enabled: true,
        gcash_enabled: true,
      });
    if (path === "/orders/my-orders") return reply(state.orders);
    if (path === "/orders/88001") return reply(state.orders[0] || fixtureOrder);
    if (path === "/shipments/orders/88001")
      return reply({ shipment: null, events: [] });
    if (path === "/notifications") return reply(state.notifications);
    if (path === "/notifications/unread-count") return reply({ count: 0 });
    if (path.includes("2fa")) return reply({ enabled: false });
    if (path.includes("/chats/"))
      return reply({ conversations: [], messages: [] });
    return reply([]);
  });
  return state;
}
