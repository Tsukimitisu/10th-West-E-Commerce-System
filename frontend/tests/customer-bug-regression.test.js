import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('login keeps unavailable OAuth choices visible with honest guidance', async () => {
  const login = await read('pages/Login.jsx');
  assert.match(login, /\/api\/auth\/providers/);
  assert.match(login, /Google login is not configured yet/);
  assert.match(login, /Facebook login is not configured yet/);
  assert.match(login, /disabled=\{[^}]*oauthProviders\.google/);
  assert.match(login, /disabled=\{[^}]*oauthProviders\.facebook/);
});

test('profile exposes TOTP setup, truthful phone state, and independent password toggles', async () => {
  const profile = await read('pages/customer/Profile.jsx');
  assert.match(profile, /setup2FA/);
  assert.match(profile, /recoveryCodes/);
  assert.match(profile, /phone_verification/);
  assert.match(profile, /Phone number verification is not configured yet/);
  for (const key of ['current', 'new', 'confirm']) {
    assert.match(profile, new RegExp(`passwordVisibility\\.${key}`));
  }
  assert.doesNotMatch(profile, /window\.prompt|prompt\(/);
});

test('forgot-password page and generic result are wired into customer login', async () => {
  const [login, forgot, app] = await Promise.all([
    read('pages/Login.jsx'),
    read('pages/ForgotPassword.jsx'),
    read('App.jsx'),
  ]);
  assert.match(login, /\/forgot-password/);
  assert.match(app, /path="\/forgot-password"/);
  assert.match(forgot, /If an account exists for this email, password reset instructions have been sent\./);
});

test('orders show a pending filter, readable order number, and complete item details', async () => {
  const [history, detail] = await Promise.all([
    read('pages/customer/OrderHistory.jsx'),
    read('pages/customer/OrderDetail.jsx'),
  ]);
  for (const status of ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled']) {
    assert.match(history, new RegExp(`id: '${status}'`));
  }
  assert.match(history, /Order Number/);
  assert.match(history, /first_item_name/);
  assert.match(detail, /Use this number when asking support about your order\./);
  assert.match(detail, /item\.name \|\| item\.product_name \|\| item\.product\?\.name/);
  assert.match(detail, /itemQuantity = [^;]*item\.quantity/);
  assert.match(detail, /Unit price/);
  assert.match(detail, /Line total/);
});

test('cart tablet grid reserves non-overlapping price and quantity columns', async () => {
  const cart = await read('pages/customer/Cart.jsx');
  assert.match(cart, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(7rem,auto\)_7\.75rem_minmax\(7\.5rem,auto\)\]/);
  assert.match(cart, /whitespace-nowrap text-sm font-semibold/);
  assert.match(cart, /w-\[7\.75rem\]/);
});

test('cart quantity updates are optimistic, per-item, bounded, and reconciled with the backend', async () => {
  const [context, drawer] = await Promise.all([
    read('context/CartContext.jsx'),
    read('components/CartDrawer.jsx'),
  ]);
  assert.match(context, /MAX_ITEM_QUANTITY/);
  assert.match(context, /nextQty > MAX_ITEM_QUANTITY/);
  assert.match(context, /quantityUpdatesRef/);
  assert.match(context, /updatingItemIds/);
  assert.match(context, /updateQuantityLocal\(productId, quantity\)/);
  assert.match(context, /const synced = await syncCart\(\)/);
  assert.match(drawer, /updatingItemIds\?\.has\(item\.productId\)/);
  assert.match(drawer, /Updating…/);
  assert.match(drawer, /item\.quantity >= MAX_ITEM_QUANTITY/);
});

test('wishlist cannot exceed 50 or bypass the existing cart quantity', async () => {
  const wishlist = await read('pages/customer/Wishlist.jsx');
  assert.match(wishlist, /MAX_ITEM_QUANTITY_MESSAGE/);
  assert.match(wishlist, /remainingCartLimit = Math\.max\(0, MAX_ITEM_QUANTITY - cartQty\)/);
  assert.match(wishlist, /cartQuantity \+ requestedQuantity > MAX_ITEM_QUANTITY/);
  assert.match(wishlist, /await addToCart/);
});

test('checkout supports saved and new address quote/order payloads and incomplete-form blocking', async () => {
  const [checkout, api] = await Promise.all([
    read('pages/customer/Checkout.jsx'),
    read('services/api.js'),
  ]);
  assert.match(checkout, /addresses\.length === 0/);
  assert.match(checkout, /newAddressComplete/);
  assert.match(checkout, /isValidPhilippineMobile/);
  assert.match(checkout, /Save this address to my address book/);
  assert.match(checkout, /\{ address: shippingAddressSnapshot, save_address: saveNewAddress \}/);
  assert.match(checkout, /address: canQuoteNewAddress \? newAddressPayload/);
  assert.doesNotMatch(checkout, /Save and select a delivery address before checkout/);
  assert.match(api, /JSON\.stringify\(\{ address_id, address, items \}\)/);
});

test('checkout refetches current stock before placing the order', async () => {
  const checkout = await read('pages/customer/Checkout.jsx');
  assert.match(checkout, /validateStockBeforeCheckout/);
  assert.match(checkout, /await getProductById\(item\.productId\)/);
  assert.match(checkout, /requested: item\.quantity/);
});
