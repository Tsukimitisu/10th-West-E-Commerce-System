// Entirely intercepted fixtures: no shop data or payments are written.
import fs from 'node:fs/promises';

// Cache the existing CDN runtime per worker, rather than redownloading it for
// every isolated browser context. An optional local cache keeps offline QA safe.
let runtimePromise;
const installTailwindRuntime = async page => {
  runtimePromise ||= process.env.E2E_TAILWIND_SCRIPT
    ? fs.readFile(process.env.E2E_TAILWIND_SCRIPT)
    : page.request.get('https://cdn.tailwindcss.com', { timeout: 25000, maxRetries: 2 }).then(async response => {
      if (!response.ok()) throw new Error(`Staff QA Tailwind runtime HTTP ${response.status()}`);
      return response.body();
    });
  const body = await runtimePromise;
  await page.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body }));
};
export const staffUser = { id: 700002, name: 'Alex Counter', email: 'staff@example.test', phone: '09171234567', role: 'store_staff', email_verified: true, has_local_password: true, two_factor_enabled: false };
export const staffPermissions = ['inventory.view', 'inventory.adjust', 'orders.view', 'orders.update', 'chat.view', 'returns.view'];
export const staffParts = [
  { id: 98001, name: 'Front Brake Pad Set', part_number: 'BRK-H125-042', motorcycle_model: 'Click 125', brand: 'Honda', color: 'Standard', box_location: 'A-04', stock_quantity: 3, low_stock_threshold: 5, price: 650, store_selling_price: 620, ecommerce_price: 650, buying_price: 400 },
  { id: 98002, name: '4T Engine Oil · 1 L', part_number: 'OIL-4T-1000', motorcycle_model: 'Universal', brand: '10th West', color: 'Standard', box_location: 'B-12', stock_quantity: 24, low_stock_threshold: 6, price: 450, store_selling_price: 430, ecommerce_price: 450, buying_price: 300 },
  { id: 98003, name: 'Drive Belt', part_number: 'BLT-H125-018', motorcycle_model: 'Click 125', brand: 'Honda', color: 'Black', box_location: 'C-02', stock_quantity: 0, low_stock_threshold: 3, price: 980, store_selling_price: 950, ecommerce_price: 980, buying_price: 700 },
];
export const staffOrders = ['processing', 'packed', 'pending'].map((status, index) => ({ id: 88001 + index, order_number: `TW-8800${index + 1}`, customer_name: ['Jamie Rider', 'Sam Cruz', 'Lee Santos'][index], customer_display_name: ['Jamie Rider', 'Sam Cruz', 'Lee Santos'][index], shipping_name: 'Jamie Rider', user_id: 90001, status, payment_status: index === 2 ? 'pending' : 'paid', payment_method: 'cod', shipping_method: index === 1 ? 'pickup' : 'delivery', total_amount: 650, created_at: '2026-10-17T08:00:00Z', items: [{ product_id: 98001, name: 'Front Brake Pad Set', quantity: 1, price: 650 }] }));

export async function staffFixture(page, options = {}) {
  await installTailwindRuntime(page);
  const state = { user: options.loggedOut ? null : { ...staffUser, ...options.user }, calls: [], permissions: options.permissions || staffPermissions };
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    state.calls.push({ path, method });
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/login') { state.user = { ...staffUser, ...options.user }; return reply({ user: state.user }); }
    if (path === '/auth/logout') { state.user = null; return reply({ message: 'Signed out' }); }
    if (path.includes('csrf')) return reply({ csrfToken: 'staff-fixture-csrf' });
    if (path.startsWith('/auth/profile')) {
      const index = state.calls.filter(call => call.path.startsWith('/auth/profile')).length - 1;
      if (options.profileDelays?.[index]) await new Promise(resolve => setTimeout(resolve, options.profileDelays[index]));
      return state.user ? reply(state.user) : reply({ message: 'Not authenticated' }, 401);
    }
    if (path === '/auth/permissions') return reply({ permissions: state.permissions });
    if (path === '/auth/providers') return reply({ google: { available: false }, facebook: { available: false }, two_factor: { available: true } });
    if (path === '/users/profile' && method === 'PUT') { state.user = { ...state.user, ...request.postDataJSON() }; return reply({ user: state.user }); }
    if (path === '/auth/change-password' && method === 'PUT') return reply({ message: 'Password changed' });
    if (path === '/auth/2fa/setup' && method === 'POST') return reply({ qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/5kAAAAASUVORK5CYII=' });
    if (path === '/auth/2fa/verify' && method === 'POST') {
      if (request.postDataJSON().totp_code !== '123456') return reply({ message: 'Invalid authenticator code' }, 400);
      state.user.two_factor_enabled = true;
      return reply({ recovery_codes: ['fixture-recovery-one', 'fixture-recovery-two'] });
    }
    if (path === '/auth/2fa' && method === 'DELETE') { state.user.two_factor_enabled = false; return reply({ success: true }); }
    if (method !== 'GET') {
      if (path.endsWith('/read') || path.includes('/read-all')) return reply({ success: true });
      return reply({ message: 'Fixture blocks business mutations' }, 409);
    }
    if (path === '/inventory') {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      return reply(staffParts.filter(item => !query || Object.values(item).some(value => String(value).toLowerCase().includes(query))));
    }
    if (path.includes('low-stock')) { const products = staffParts.filter(item => item.stock_quantity <= item.low_stock_threshold); return reply({ count: products.length, products }); }
    if (path === '/orders') return reply(staffOrders);
    if (path.startsWith('/orders/')) return reply(staffOrders[0]);
    if (path.includes('motorcycle-models')) return reply({ models: [{ id: 1, model_name: 'Click 125', brand: 'Honda', status: 'active' }] });
    if (path === '/notifications') return reply([{ id: 1, title: 'Parts need attention', message: 'Front Brake Pad Set is below minimum stock.', type: 'warning', reference_type: 'inventory', is_read: false, created_at: '2026-10-17T08:00:00Z' }]);
    if (path.includes('unread-count')) return reply({ count: 1 });
    if (path === '/seller/chats') return reply({ conversations: [{ id: 90001, buyer_name: 'Jamie Rider', subject: 'Brake pad compatibility', last_message_text: 'Does this fit Click 125?', seller_unread_count: 1, last_message_at: '2026-10-17T08:00:00Z' }] });
    if (path === '/seller/chats/90001') return reply({ conversation: { id: 90001, buyer_name: 'Jamie Rider', subject: 'Brake pad compatibility' }, messages: [{ id: 1, sender_id: 90001, sender_role: 'customer', message_text: 'Does this fit Click 125?', created_at: '2026-10-17T08:00:00Z' }] });
    if (path.startsWith('/pos/')) return state.permissions.includes('pos.access') || state.user?.role === 'cashier' ? reply(path.endsWith('/capabilities') ? { can_access: true, can_discount: false, can_void: false } : path.endsWith('/products') ? { products: staffParts.map(item => ({ ...item, available_stock: item.stock_quantity })) } : []) : reply({ code: 'PERMISSION_DENIED', message: 'Permission denied' }, 403);
    return reply([]);
  });
  return state;
}
