import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cartPendingKey, createPendingGuard, runWithPendingKey } from '../utils/cartPending.js';
import { bannerDestination, managedHeroSlides } from '../utils/managedHero.js';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('add-to-cart pending state is keyed: only the clicked product is pending', async () => {
  const snapshots = [];
  const guard = createPendingGuard((keys) => snapshots.push([...keys]));
  let release;
  const request = runWithPendingKey(guard, cartPendingKey(2), () => new Promise((resolve) => { release = resolve; }));
  assert.equal(guard.has(cartPendingKey(2)), true);
  assert.equal(guard.has(cartPendingKey(1)), false);
  assert.equal(guard.has(cartPendingKey(3)), false);
  release(true);
  assert.equal(await request, true);
  assert.equal(guard.has(cartPendingKey(2)), false);
  assert.deepEqual(snapshots, [['2:0'], []]);
});

test('a rapid double click on the same key does not duplicate the cart mutation', async () => {
  const guard = createPendingGuard();
  let mutations = 0;
  const task = async () => { mutations += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return true; };
  const [first, second] = await Promise.all([runWithPendingKey(guard, cartPendingKey(7), task), runWithPendingKey(guard, cartPendingKey(7), task)]);
  assert.deepEqual([first, second, mutations], [true, false, 1]);
  assert.equal(await runWithPendingKey(guard, cartPendingKey(7), task), true);
  assert.equal(mutations, 2);
  assert.notEqual(cartPendingKey(7, null, 90), cartPendingKey(7), 'set context gets its own key');
  assert.notEqual(cartPendingKey(7, 3), cartPendingKey(7), 'variant gets its own key');
});

test('cart context and product surfaces use keyed pending state, not a global loading flag', async () => {
  const [context, card, detail] = await Promise.all([read('context/CartContext.jsx'), read('components/ProductCard.jsx'), read('pages/ProductDetail.jsx')]);
  const addBlock = context.split('const performAddToCart')[1].split('const addToCartLocal')[0];
  assert.doesNotMatch(addBlock, /setLoading\(/);
  assert.match(context, /runWithPendingKey\(pendingCartGuardRef\.current, key/);
  assert.match(context, /listing_id: options\.listingId/);
  assert.doesNotMatch(card, /cartLoading/);
  assert.match(card, /isCartKeyPending\(cartPendingKey\(productId\)\)/);
  assert.match(card, /disabled=\{outOfStock \|\| pending\}/);
  assert.match(card, /'Adding…'/);
  assert.match(detail, /isCartKeyPending\(cartPendingKey\(product\.id, selectedVariantRow\?\.id\)\)/);
});

test('set listing customer page adds and buys the real child item through the set selector', async () => {
  const [page, sheet, card, app, list] = await Promise.all([
    read('pages/SetProductDetail.jsx'), read('components/customer/SetPurchaseSheet.jsx'), read('components/ProductCard.jsx'), read('App.jsx'), read('pages/ProductList.jsx'),
  ]);
  assert.match(app, /path="\/sets\/:id" element=\{<SetProductDetail \/>\}/);
  assert.match(page, /addToCart\(toCartProduct\(set, option\), quantity, \{ listingId: set\.id \}\)/);
  assert.match(page, /item: \{ productId: option\.id, product: toCartProduct\(set, option\), quantity \}/);
  assert.match(page, /navigate\('\/checkout\?buyNow=1'/);
  assert.match(sheet, /role="radiogroup"/);
  assert.match(sheet, /role="radio"/);
  assert.match(sheet, /aria-checked=\{isSelected\}/);
  assert.match(sheet, /aria-disabled=\{!option\.is_available \|\| undefined\}/);
  assert.match(sheet, /if \(!option\.is_available\) return;/);
  assert.match(sheet, /<span className="sr-only">Selected<\/span>/);
  assert.match(sheet, /aria-label="Decrease quantity"/);
  assert.ok(sheet.includes("presentation={isDesktop ? 'modal' : 'sheet'}"), 'bottom sheet on mobile, modal on desktop');
  assert.doesNotMatch(sheet, /#ee4d2d|bg-red-5|text-pink/i, 'no marketplace red/pink branding');
  assert.match(card, /isSet \? `\/sets\/\$\{product\.id\}`/);
  assert.match(list, /getStorefrontSets\(\)/);
});

test('owner set editor stores only item ids and supports add, remove and reorder', async () => {
  const [view, picker] = await Promise.all([read('pages/owner/StorefrontListingsView.jsx'), read('components/owner/InventoryPickerModal.jsx')]);
  assert.match(view, /Add Set Listing/);
  assert.match(view, /items: form\.items\.map\(\(item\) => item\.id\)/);
  assert.match(view, /listing_type: 'set'/);
  assert.match(view, /aria-label=\{`Move \$\{item\.name\} up`\}/);
  assert.match(view, /aria-label=\{`Remove \$\{item\.name\} from set`\}/);
  assert.match(picker, /multi = false, selectedIds = \[\]/);
  assert.match(picker, /aria-pressed=\{chosen\}/);
});

test('hero CTA: set and product destinations navigate in-app; no-link and invalid slides show no CTA', async () => {
  assert.deepEqual(bannerDestination('/sets/9'), { href: '/sets/9', internal: true });
  assert.deepEqual(bannerDestination('/products/4'), { href: '/products/4', internal: true });
  assert.deepEqual(bannerDestination('/shop?promotion=3'), { href: '/shop?promotion=3', internal: true });
  const slides = managedHeroSlides([
    { id: 1, title: 'Fairings', link_url: '/sets/9', button_text: 'View Set', is_active: true },
    { id: 2, title: 'Info only', link_url: '', button_text: 'Ignored', is_active: true },
    { id: 3, title: 'Bad', link_url: 'javascript:alert(1)', is_active: true },
  ]);
  assert.deepEqual(slides.map((slide) => slide.destination?.href ?? null), ['/sets/9', null, null]);
  assert.equal(slides[0].cta, 'View Set');
  const [hero, editor] = await Promise.all([read('components/customer/ManagedHeroCarousel.jsx'), read('components/owner/CarouselSlideEditor.jsx')]);
  assert.match(hero, /slide\.destination &&/);
  assert.match(hero, /<BrandButton to=\{slide\.destination\.href\}/);
  assert.match(editor, /\['set','Set listing'\]/);
  assert.match(editor, /kind="set"/);
});
