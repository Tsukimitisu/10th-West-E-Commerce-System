import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecentlyViewedIds, readRecentlyViewedIds, reconcileRecentlyViewed, recordRecentlyViewed, removeRecentlyViewed } from '../utils/recentlyViewed.js';

const product = { id: 1, name: 'Current part', price: 115, available_stock: 3, inventory_status: 'active', visibility_status: 'active' };
const storage = initial => {
  let value = typeof initial === 'string' ? initial : JSON.stringify(initial);
  return { getItem(key) { assert.equal(key, 'recentlyViewed'); return value ?? null; },
    setItem(key, next) { assert.equal(key, 'recentlyViewed'); value = next; },
    removeItem(key) { assert.equal(key, 'recentlyViewed'); value = null; } };
};

test('history resolves existing IDs to fresh server objects and removes deleted IDs/snapshots', () => {
  const saved = storage([{ id: 2, name: 'Deleted' }, { id: 1, name: 'Stale name', price: 1 }, 1]);
  const recent = reconcileRecentlyViewed([product], saved);
  assert.deepEqual(recent, [product]); assert.equal(recent[0], product);
  assert.equal(saved.getItem('recentlyViewed'), '[1]');
});

test('empty server catalog removes the storage entry and yields no recent products', () => {
  const saved = storage([product]);
  assert.deepEqual(reconcileRecentlyViewed([], saved), []);
  assert.equal(saved.getItem('recentlyViewed'), null);
});

test('history excludes deleted, hidden, inactive and unavailable stock without changing catalog objects', () => {
  const products = [product, { ...product, id: 2, is_deleted: true }, { ...product, id: 3, visibility_status: 'hidden' },
    { ...product, id: 4, inventory_status: 'inactive' }, { ...product, id: 5, available_stock: 0 }, { ...product, id: 6, status: 'archived' }];
  const before = structuredClone(products), saved = storage(products);
  assert.deepEqual(reconcileRecentlyViewed(products, saved), [product]);
  assert.deepEqual(products, before);
});

test('IDs migrate, deduplicate and stay newest-first with a maximum of ten', () => {
  assert.deepEqual(normalizeRecentlyViewedIds([3, '2', { id: 3 }, { id: 1 }, 0, -1, true, {}, null, 'invalid']), [3,2,1]);
  const saved = storage(Array.from({ length: 15 }, (_, index) => ({ id: index + 1 })));
  recordRecentlyViewed(8, saved);
  assert.deepEqual(readRecentlyViewedIds(saved), [8,1,2,3,4,5,6,7,9,10]);
  removeRecentlyViewed('3', saved);
  assert.deepEqual(readRecentlyViewedIds(saved), [8,1,2,4,5,6,7,9,10]);
  assert.ok(JSON.parse(saved.getItem('recentlyViewed')).every(Number.isInteger));
});

test('corrupt or non-array storage is cleared and a later visit can be recorded', () => {
  for (const raw of ['{bad', '{}', 'null', '42', '"text"']) {
    const saved = storage(raw);
    assert.deepEqual(reconcileRecentlyViewed([product], saved), []);
    assert.equal(saved.getItem('recentlyViewed'), null);
    recordRecentlyViewed(1, saved);
    assert.deepEqual(readRecentlyViewedIds(saved), [1]);
  }
});

test('unavailable browser storage never breaks the live catalog or Detail visit', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(reconcileRecentlyViewed([product], blocked), []);
  assert.doesNotThrow(() => recordRecentlyViewed(1, blocked));
  assert.doesNotThrow(() => removeRecentlyViewed(1, blocked));
});
