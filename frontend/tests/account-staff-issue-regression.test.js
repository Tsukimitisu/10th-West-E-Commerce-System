import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('OAuth, 2FA, GCash, and phone readiness are represented truthfully', async () => {
  const [login, checkout, profile] = await Promise.all([
    read('pages/Login.jsx'),
    read('pages/customer/Checkout.jsx'),
    read('pages/customer/Profile.jsx'),
  ]);
  assert.match(login, /Google login is not configured yet\./);
  assert.match(login, /Facebook login is not configured yet\./);
  assert.match(login, /disabled=\{[^}]*oauthProviders\.google/);
  assert.match(login, /disabled=\{[^}]*oauthProviders\.facebook/);
  assert.match(checkout, /disabled=\{gcashAvailability\.loading \|\| !gcashAvailability\.available\}/);
  assert.match(checkout, /GCash is not configured yet\. Cash on Delivery remains available\./);
  assert.match(profile, /setup2FA/);
  assert.match(profile, /recoveryCodes/);
  assert.match(profile, /PhoneVerification savedPhone=/);
  const phone = await read('components/customer/PhoneVerification.jsx');
  assert.match(phone, /Verification unavailable/);
  assert.match(phone, /getPhoneVerification/);
  assert.match(profile, /PROFILE_PHONE_REGEX/);
});

test('customer order summary, shipping address, and payment cards use readable dark-theme text', async () => {
  const detail = await read('pages/customer/OrderDetail.jsx');
  for (const heading of ['Order Summary', 'Shipping Address', 'Payment']) assert.ok(detail.includes(heading));
  assert.match(detail, /bg-gray-900/);
  assert.match(detail, /text-white/);
  assert.match(detail, /text-gray-300/);
  assert.doesNotMatch(detail, /bg-gray-9\d\d[^"']*text-gray-9\d\d/);
});

test('cart and checkout share the configured free-shipping explanation and progress states', async () => {
  const [cart, checkout, product] = await Promise.all([
    read('pages/customer/Cart.jsx'),
    read('pages/customer/Checkout.jsx'),
    read('pages/ProductDetail.jsx'),
  ]);
  for (const source of [cart, checkout]) {
    assert.match(source, /Free shipping applies when your order subtotal reaches/);
    assert.match(source, /before shipping fees\./);
    assert.match(source, /more to unlock free shipping\./);
    assert.match(source, /Free shipping applied\./);
  }
  assert.match(product, /getShippingConfig/);
  assert.doesNotMatch(product, /Orders PHP 2,500\+/);
});

test('checkout success actions keep readable hover, focus, and active text', async () => {
  const confirmation = await read('pages/customer/OrderConfirmation.jsx');
  assert.match(confirmation, /hover:text-white/);
  assert.match(confirmation, /focus-visible:text-white/);
  assert.match(confirmation, /active:text-white/);
  for (const action of ['View Invoice', 'Continue Shopping', 'Go Home']) {
    assert.match(confirmation, new RegExp(action));
  }
});

test('successful COD checkout clears purchased cart rows locally only after success', async () => {
  const [checkout, context] = await Promise.all([
    read('pages/customer/Checkout.jsx'),
    read('context/CartContext.jsx'),
  ]);
  const orderCall = checkout.indexOf('await createOrder(checkoutData)');
  const clearCall = checkout.indexOf('clearPurchasedItemsLocal(items)');
  assert.ok(orderCall > -1 && clearCall > orderCall);
  assert.match(checkout, /paymentMethod === 'cod' && checkout\?\.order_id/);
  assert.match(checkout, /purchase_source: isBuyNow \? 'buy_now' : 'cart'/);
  assert.match(context, /const clearPurchasedItemsLocal/);
  assert.match(context, /purchasedKeys/);
});

test('review form is delivery-gated and Helpful is explained but disabled', async () => {
  const [product, review] = await Promise.all([
    read('pages/ProductDetail.jsx'),
    read('components/ReviewCard.jsx'),
  ]);
  assert.match(product, /reviewEligibility\.eligible \?/);
  assert.match(product, /You can review this item after it is delivered\./);
  assert.match(product, /getReviewEligibility/);
  assert.match(review, /Mark this review as helpful for other shoppers\./);
  assert.match(review, /Helpful \(coming soon\)/);
  assert.match(review, /disabled/);
});

test('shop filters have independent viewport scrolling on desktop and a mobile drawer', async () => {
  const filters = await read('components/FilterSidebar.jsx');
  assert.match(filters, /max-h-\[calc\(100vh-7rem\)\]/);
  assert.match(filters, /overflow-y-auto/);
  assert.match(filters, /overscroll-contain/);
  assert.match(filters, /scrollbar-gutter:stable/);
  assert.match(filters, /max-h-\[88vh\]/);
});

test('FAQ and return policy use accurate payment wording, readable colors, and ordered sections', async () => {
  const [faq, policy] = await Promise.all([
    read('pages/Support/FAQ.jsx'),
    read('pages/Support/ReturnPolicy.jsx'),
  ]);
  assert.match(faq, /Currently, customers can pay using Cash on Delivery\./);
  assert.match(faq, /GCash via PayMongo and credit card payments are planned but not yet available\./);
  assert.doesNotMatch(faq, /cash\(in-store/i);
  assert.match(policy, /<ol className="list-decimal/);
  assert.match(policy, /bg-white/);
  assert.match(policy, /text-slate-900/);
  for (const title of ['Eligibility for Return', 'Non-Returnable Items', 'Return Request Period', 'Required Proof', 'Refund Process', 'Exchange Policy', 'Damaged or Incorrect Items', 'Contact and Support Instructions']) {
    assert.match(policy, new RegExp(title));
  }
});

test('account sidebar and dropdown use the same names and ordering', async () => {
  const [layout, navbar] = await Promise.all([
    read('components/customer/AccountLayout.jsx'),
    read('components/Navbar.jsx'),
  ]);
  const expected = ['My Profile', 'My Orders', 'Messages', 'Wishlist', 'Address Book', 'Returns'];
  const desktopStart = navbar.indexOf('<Link to="/profile"', navbar.indexOf('{userMenuOpen &&'));
  const desktopEnd = navbar.indexOf('Admin Panel', desktopStart);
  const desktopMenu = navbar.slice(desktopStart, desktopEnd);
  for (const source of [layout, desktopMenu]) {
    assert.match(source, /My Profile[\s\S]*My Orders[\s\S]*Messages[\s\S]*Wishlist[\s\S]*Address Book[\s\S]*Returns/);
    expected.forEach((label) => assert.ok(source.includes(label)));
    assert.doesNotMatch(source, /WishList/);
  }
});

test('store staff cannot navigate to Customers and products/inventory headers are readable', async () => {
  const [layout, dashboard, products, inventory] = await Promise.all([
    read('components/owner/AdminLayout.jsx'),
    read('pages/owner/AdminDashboard.jsx'),
    read('pages/owner/ProductsView.jsx'),
    read('pages/owner/InventoryView.jsx'),
  ]);
  assert.match(layout, /user\?\.role === 'store_staff' && item\.id === 'customers'/);
  assert.match(dashboard, /isStaff && activeView === 'customers'/);
  for (const source of [products, inventory]) {
    assert.match(source, /bg-slate-100/);
    assert.match(source, /text-slate-700/);
  }
});

test('staff orders use safe names, distinct failed labels, responsive filters, and complete item details', async () => {
  const orders = await read('pages/owner/OrdersView.jsx');
  assert.match(orders, /customer_display_name \|\| 'Customer unavailable'/);
  assert.doesNotMatch(orders, /user undefined/i);
  assert.match(orders, /Payment Failed: payment was not completed or was rejected\./);
  assert.match(orders, /Delivery Failed: courier\/store could not complete delivery\./);
  assert.match(orders, /grid-cols-1[^\n]*lg:grid-cols-\[minmax\(16rem,24rem\)_minmax\(0,1fr\)\]/);
  assert.match(orders, /flex min-w-0 flex-wrap/);
  assert.match(orders, /resolveProductImageUrl\(item\.image_url/);
  assert.match(orders, /item\.name \|\| item\.product_name/);
  assert.match(orders, /Unit:/);
  assert.match(orders, /item\.line_total/);
});

test('notification symbols are semantic icons and mojibake is repaired before rendering', async () => {
  const [navbar, admin, textUtility] = await Promise.all([
    read('components/Navbar.jsx'),
    read('components/owner/AdminLayout.jsx'),
    read('utils/text.js'),
  ]);
  for (const source of [navbar, admin]) {
    for (const label of ['Error notification', 'Warning notification', 'Success notification', 'Information notification']) {
      assert.match(source, new RegExp(label));
    }
  }
  assert.match(admin, /repairMojibake\(notification\.message\)/);
  assert.match(textUtility, /repairMojibake/);
});

test('POS, variants, categories, barcode, and inventory adjustment controls remain bounded and safe', async () => {
  const [pos, variants, products, inventory, receive] = await Promise.all([
    read('pages/staff/PosTerminal.jsx'),
    read('components/owner/VariantsModal.jsx'),
    read('pages/owner/ProductsView.jsx'),
    read('pages/owner/InventoryView.jsx'),
    read('components/owner/ReceiveStock.jsx'),
  ]);
  assert.match(pos, /Maximum POS quantity per item is 100\./);
  assert.match(pos, /Math\.min\(MAX_POS_QUANTITY, item\.available_stock/);
  assert.match(variants, /max-h-\[420px\] overflow-auto/);
  assert.match(variants, /No combinations yet\. Add an option name and at least one value\./);
  assert.match(products, /String\(product\?\.category_id \?\? ''\) === String\(filterCat\)/);
  assert.match(products, /categories\.some/);
  assert.match(products, /Barcode field\/search only\. Scanner integration is not configured\./);
  assert.match(receive, /camera scanner integration is not configured/);
  assert.match(inventory, /STOCK_ADJUSTMENT_REASONS\[adjForm\.type\]/);
  assert.match(inventory, /correction_add/);
  assert.match(inventory, /correction_remove/);
});

test('wishlist empty state and add-to-cart keep stock and quantity safeguards', async () => {
  const wishlist = await read('pages/customer/Wishlist.jsx');
  assert.match(wishlist, /MAX_ITEM_QUANTITY/);
  assert.match(wishlist, /stockQuantity/);
  assert.match(wishlist, /await addToCart/);
  assert.match(wishlist, /Your wishlist is empty|No items in your wishlist/i);
});
