import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  hasSearchableProductText,
  isUnsafeProductSearch,
  shouldReturnEmptyProductSearch,
} from '../utils/productSearchSafety.js';

test('injection-shaped searches render the catalog no-results state', async () => {
  for (const input of ["' OR 1=1 --", '<script>alert(1)</script>', 'javascript:alert(1)']) {
    assert.equal(isUnsafeProductSearch(input), true);
  }
  assert.equal(isUnsafeProductSearch('brake'), false);
  const page = await readFile(new URL('../pages/ProductList.jsx', import.meta.url), 'utf8');
  assert.match(page, /if \(shouldReturnEmptyProductSearch\(debouncedSearchQuery\)\) return \[\]/);
  assert.match(page, /No products found\./);
});

test('symbol searches return empty while a cleared search restores the full catalog', async () => {
  for (const input of ['@$%&^$', '%%%', '###', '😀', "' OR 1=1 --", '<script>alert(1)</script>']) {
    assert.equal(shouldReturnEmptyProductSearch(input), true, input);
  }
  for (const input of ['', '   ', 'brake', 'motul', 'mio', 'yamaha', 'honda', 'nmax']) {
    assert.equal(shouldReturnEmptyProductSearch(input), false, input);
  }
  for (const input of ['%%%', '###', '😀', '']) assert.equal(hasSearchableProductText(input), false);
  for (const input of ['brake', 'motul']) assert.equal(hasSearchableProductText(input), true);
  const [page, api, navbar] = await Promise.all([
    readFile(new URL('../pages/ProductList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../services/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /shouldReturnEmptyProductSearch\(debouncedSearchQuery\)/);
  assert.doesNotMatch(page, /searchParams\.has\('search'\) && !hasSearchableProductText/);
  assert.match(api, /shouldReturnEmptyProductSearch\(params\.search\)/);
  assert.match(navbar, /shouldReturnEmptyProductSearch\(query\)/);
  assert.match(navbar, /setSearchResults\(\[\]\)/);
  assert.ok(
    navbar.indexOf('shouldReturnEmptyProductSearch(query)') < navbar.indexOf('getProducts({ search: query'),
    'the invalid-query guard must run before the product API request'
  );
  assert.match(navbar, /navigate\('\/shop\?search='\)/);
});
