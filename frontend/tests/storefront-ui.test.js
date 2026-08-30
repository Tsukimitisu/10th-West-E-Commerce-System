import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('storefront navbar keeps primary destinations concise without catalog shortcuts or a generic More menu', async () => {
  const navbar = await read('components/Navbar.jsx');

  for (const destination of ['Home', 'Shop', 'Support']) {
    assert.match(navbar, new RegExp(`>${destination}<|\\n\\s*${destination}\\n`));
  }
  for (const removedDestination of ['New Arrivals', 'Best Sellers', 'Brands']) {
    assert.doesNotMatch(navbar, new RegExp(`>${removedDestination}<|\\n\\s*${removedDestination}\\n`));
  }
  assert.doesNotMatch(navbar, />\s*More\s*</);
  assert.match(navbar, /aria-label="Primary navigation"/);
  assert.match(navbar, /setMobileOpen\(false\)/);
});

test('shop uses a wide catalog shell with desktop filters and a mobile drawer', async () => {
  const [shop, filters] = await Promise.all([
    read('pages/ProductList.jsx'),
    read('components/FilterSidebar.jsx'),
  ]);

  assert.match(shop, /max-w-\[1600px\]/);
  assert.match(shop, /2xl:grid-cols-5/);
  assert.match(filters, /w-\[280px\]/);
  assert.match(filters, /sticky top-24/);
  assert.match(filters, /overflow-y-auto/);
  assert.match(filters, /role="dialog"/);
  assert.match(filters, /Show \{resultCount \?\? 0\} results/);
});

test('catalog toolbar keeps sorting, views, active chips, and clear actions usable', async () => {
  const shop = await read('pages/ProductList.jsx');

  assert.match(shop, /aria-label="Sort products"/);
  assert.match(shop, /aria-label="Grid view"/);
  assert.match(shop, /aria-label="List view"/);
  assert.match(shop, /aria-label="Active filters"/);
  assert.match(shop, /removeFilter\(filter\.key\)/);
  assert.match(shop, /Clear all/);
});

test('category, brand, fitment, price, and availability controls retain their handlers', async () => {
  const [shop, filters] = await Promise.all([
    read('pages/ProductList.jsx'),
    read('components/FilterSidebar.jsx'),
  ]);

  for (const handler of ['onCategoryChange', 'onBrandChange', 'onModelChange', 'onYearChange', 'onPriceChange', 'onStockChange']) {
    assert.match(filters, new RegExp(handler));
  }
  assert.match(shop, /selectedCategory=\{selectedCategory\}/);
  assert.match(shop, /selectedBrand=\{selectedBrand\}/);
  assert.match(shop, /priceRange=\{priceRange\}/);
  assert.match(shop, /inStockOnly=\{inStockOnly\}/);
});

test('product cards preserve core shopping actions with polished responsive presentation', async () => {
  const card = await read('components/ProductCard.jsx');

  assert.match(card, /aspect-\[4\/3\]/);
  assert.match(card, /line-clamp-2/);
  assert.match(card, /PriceDisplay/);
  assert.match(card, /In stock/);
  assert.match(card, /Add to cart/);
  assert.match(card, /handleWishlist/);
  assert.match(card, /interactive-card/);
});

test('home sections and footer share the wider restrained storefront system', async () => {
  const [home, footer] = await Promise.all([
    read('pages/Home.jsx'),
    read('components/Footer.jsx'),
  ]);

  assert.match(home, /max-w-\[1500px\]/);
  assert.match(home, /Featured products/);
  assert.match(home, /Best sellers/);
  assert.match(home, /New arrivals/);
  assert.match(footer, /max-w-\[1500px\]/);
});

test('storefront motion remains subtle and respects reduced-motion preferences', async () => {
  const [app, styles] = await Promise.all([
    read('App.jsx'),
    read('index.css'),
  ]);

  assert.match(app, /useReducedMotion/);
  assert.match(app, /duration: shouldReduceMotion \|\| isAccountRoute \? 0 : 0\.18/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /translateY\(-2px\)/);
  assert.match(styles, /animate-drawer-in/);
});
