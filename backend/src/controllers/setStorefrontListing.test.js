import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, afterEach, beforeEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE = 'postgres';

const { default: pool } = await import('../config/database.js');
const { createEcommerceListing, getPublicSet, normalizeListingInput, mapListing } = await import('./ecommerceListingController.js');
const { addToCart } = await import('./cartController.js');
const { mapSetOption, resetSetListingSchemaCache, storefrontVisibilitySql } = await import('../services/setListings.js');
const { calculateEcommercePrice } = await import('../services/catalogPricing.js');

beforeEach(() => resetSetListingSchemaCache(true));
afterEach(() => { mock.restoreAll(); resetSetListingSchemaCache(null); });
after(async () => pool.end().catch(() => {}));

const makeResponse = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const item = (patch = {}) => ({ id: 11, name: 'Coverside LEFT SIDE', part_number: 'M3-CL', color: 'Glossy Black', image: '/uploads/cl.webp',
  store_selling_price: 400, stock_quantity: 5, reserved_stock: 1, inventory_status: 'active', is_deleted: false, has_variants: false, sort_order: 0, ...patch });

test('set listing input requires a title and unique real item IDs, and never accepts price/stock overrides', () => {
  const base = { listing_type: 'set', title: 'Mio 125 M3 Fairings', items: [11, 12], visibility_status: 'draft' };
  assert.deepEqual(normalizeListingInput(base).itemIds, [11, 12]);
  assert.equal(normalizeListingInput({ ...base, motorcycle_model_id: 3 }).motorcycleModelId, 3);
  for (const patch of [{ title: '' }, { items: [] }, { items: [11, 11] }, { items: ['x'] }, { price: 1 }, { stock_quantity: 9 }, { store_selling_price: 2 }]) {
    assert.throws(() => normalizeListingInput({ ...base, ...patch }), { status: 400 }, JSON.stringify(patch));
  }
  assert.throws(() => normalizeListingInput({ inventory_item_id: 4, motorcycle_model_id: 3 }), { code: 'INVENTORY_FIELDS_READ_ONLY' });
  assert.equal(normalizeListingInput({ inventory_item_id: 4 }).listingType, 'single');
});

test('owner creates a set with multiple valid items by storing relationships only', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      const source = String(sql); calls.push({ source, params });
      if (source.includes('INSERT INTO ecommerce_listings')) return { rows: [{ id: 90 }], rowCount: 1 };
      if (source.includes('FROM products p') && source.includes('ANY')) return { rows: [{ id: 11, inventory_status: 'active', has_variants: false }, { id: 12, inventory_status: 'active', has_variants: false }] };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async () => ({ rows: [{ id: 90, listing_type: 'set', title: 'Mio 125 M3 Fairings', visibility_status: 'active', media: [], items: [item(), item({ id: 12, sort_order: 1 })] }] }));
  const res = makeResponse();
  await createEcommerceListing({ body: { listing_type: 'set', title: 'Mio 125 M3 Fairings', items: [11, 12], visibility_status: 'active', media: [{ url: '/uploads/set.webp', media_type: 'image' }] } }, res);
  assert.equal(res.statusCode, 201);
  assert.ok(calls.some(({ source }) => source.includes("VALUES ('set'")));
  const relation = calls.find(({ source }) => source.includes('INSERT INTO ecommerce_listing_items'));
  assert.deepEqual(relation.params, [90, [11, 12]]);
  assert.ok(!calls.some(({ source }) => /INSERT INTO products/i.test(source)), 'no duplicated product rows');
  assert.equal(res.body.listing.items.length, 2);
  assert.equal(res.body.listing.items[0].store_selling_price, 400);
});

test('set creation rejects items that do not exist', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const source = String(sql); calls.push(source);
      if (source.includes('INSERT INTO ecommerce_listings')) return { rows: [{ id: 91 }] };
      if (source.includes('ANY')) return { rows: [{ id: 11, inventory_status: 'active', has_variants: false }] };
      return { rows: [] };
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  const res = makeResponse();
  await createEcommerceListing({ body: { listing_type: 'set', title: 'Set', items: [11, 999] } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'SET_ITEM_NOT_FOUND');
  assert.ok(calls.includes('ROLLBACK'));
});

test('child options derive price/stock from inventory; out-of-stock and inactive items are disabled', () => {
  const live = mapSetOption(item());
  assert.equal(live.price, calculateEcommercePrice(400));
  assert.equal(live.stock_quantity, 4);
  assert.equal(live.is_available, true);
  const soldOut = mapSetOption(item({ stock_quantity: 2, reserved_stock: 2 }));
  assert.equal(soldOut.is_available, false); assert.equal(soldOut.unavailable_reason, 'Out of stock');
  const inactive = mapSetOption(item({ inventory_status: 'inactive' }));
  assert.equal(inactive.is_available, false); assert.equal(inactive.unavailable_reason, 'Unavailable');
  assert.equal(mapSetOption(item({ has_variants: true })).is_available, false);
});

test('customer set detail returns included items in one query without internal inventory fields', async () => {
  const queries = [];
  mock.method(pool, 'query', async (sql, params) => {
    queries.push(String(sql));
    assert.deepEqual(params, [90]);
    return { rows: [{ id: 90, title: 'Mio 125 M3 Fairings', ecommerce_description: '<p>Full set</p>', set_motorcycle_model: 'Mio 125',
      media: [{ url: '/uploads/set.webp', media_type: 'image', sort_order: 0 }],
      items: [item({ box_location: 'B-12', buying_price: 100 }), item({ id: 12, stock_quantity: 0, sort_order: 1 })] }] };
  });
  const res = makeResponse();
  await getPublicSet({ params: { id: '90' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /listing_type = 'set' AND l\.visibility_status = 'active'/);
  assert.equal(res.body.options.length, 2);
  assert.equal(res.body.options[1].is_available, false);
  assert.equal(res.body.price, calculateEcommercePrice(400));
  const serialized = JSON.stringify(res.body);
  for (const key of ['box_location', 'buying_price', 'store_selling_price', 'reserved_stock']) assert.ok(!serialized.includes(key), key);
});

test('missing or inactive set returns 404', async () => {
  mock.method(pool, 'query', async () => ({ rows: [] }));
  const res = makeResponse();
  await getPublicSet({ params: { id: '5' } }, res);
  assert.equal(res.statusCode, 404);
  const bad = makeResponse();
  await getPublicSet({ params: { id: '1;drop' } }, bad);
  assert.equal(bad.statusCode, 404);
});

const cartClient = (productRows) => {
  const calls = [];
  return {
    calls,
    client: {
      async query(sql, params) {
        const source = String(sql); calls.push({ source, params });
        if (source.includes('FROM carts')) return { rows: [{ id: 20, user_id: 7 }], rowCount: 1 };
        if (source.includes('FROM products p') && source.includes('FOR UPDATE')) return { rows: productRows, rowCount: productRows.length };
        return { rows: [], rowCount: 0 };
      },
      release() {},
    },
  };
};

test('add to cart through a set validates membership and stores the real child item', async () => {
  const { calls, client } = cartClient([{ id: 11, stock_quantity: 5, reserved_stock: 0, has_variants: false }]);
  mock.method(pool, 'connect', async () => client);
  const res = makeResponse();
  await addToCart({ body: { product_id: 11, listing_id: 90, quantity: 2 }, user: { id: 7 } }, res);
  assert.equal(res.statusCode, 200);
  const lookup = calls.find(({ source }) => source.includes('FROM products p') && source.includes('FOR UPDATE'));
  assert.match(lookup.source, /li\.listing_id = \$2 AND li\.product_item_id = p\.id/);
  assert.match(lookup.source, /sl\.listing_type = 'set' AND sl\.visibility_status = 'active'/);
  assert.deepEqual(lookup.params, [11, 90]);
  const insert = calls.find(({ source }) => source.includes('INSERT INTO cart_items'));
  assert.deepEqual(insert.params, [20, 11, null, 2]);
});

test('an item not included in the set cannot be purchased through that listing', async () => {
  const { calls, client } = cartClient([]);
  mock.method(pool, 'connect', async () => client);
  const res = makeResponse();
  await addToCart({ body: { product_id: 77, listing_id: 90, quantity: 1 }, user: { id: 7 } }, res);
  assert.equal(res.statusCode, 404);
  assert.ok(!calls.some(({ source }) => source.includes('INSERT INTO cart_items')));
  const invalid = makeResponse();
  await addToCart({ body: { product_id: 11, listing_id: 'abc' }, user: { id: 7 } }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test('single listings keep working and set membership only widens visibility once migrated', async () => {
  const { calls, client } = cartClient([{ id: 4, stock_quantity: 5, reserved_stock: 0, has_variants: false }]);
  mock.method(pool, 'connect', async () => client);
  const res = makeResponse();
  await addToCart({ body: { product_id: 4, quantity: 1 }, user: { id: 7 } }, res);
  assert.equal(res.statusCode, 200);
  const lookup = calls.find(({ source }) => source.includes('FOR UPDATE OF p'));
  assert.match(lookup.source, /own_el\.inventory_item_id = p\.id AND own_el\.visibility_status = 'active'/);
  assert.deepEqual(lookup.params, [4]);
  assert.doesNotMatch(storefrontVisibilitySql('p', false), /ecommerce_listing_items/);
  assert.match(storefrontVisibilitySql('p', true), /set_el\.listing_type = 'set'/);
  assert.equal(mapListing({ listing_type: 'single', store_selling_price: 100, stock_quantity: 3, reserved_stock: 1 }).available_stock, 2);
});

test('checkout, buy-now discount validation, and shipping share the set-aware visibility rule', async () => {
  const [checkout, shipping, product] = await Promise.all([
    readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8'),
    readFile(new URL('../services/shipping/internalShipping.js', import.meta.url), 'utf8'),
    readFile(new URL('./productController.js', import.meta.url), 'utf8'),
  ]);
  assert.equal((checkout.match(/storefrontVisibilitySql\('p', withSets\)/g) || []).length, 2);
  assert.match(shipping, /storefrontVisibilitySql\('p', withSets\)/);
  assert.match(product, /storefrontVisibilitySql\('p', withSets\)\} AS visibility_status/);
});

test('set migration is additive and keeps single listings intact', async () => {
  const migration = await readFile(new URL('../../migrations/202610190001_set_storefront_listings.cjs', import.meta.url), 'utf8');
  assert.match(migration, /defaultTo\('single'\)/);
  assert.match(migration, /ecommerce_listing_items/);
  assert.match(migration, /listing_type = 'single' AND inventory_item_id IS NOT NULL/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP TABLE ecommerce_listings|dropTable\('ecommerce_listings'\)/);
});
