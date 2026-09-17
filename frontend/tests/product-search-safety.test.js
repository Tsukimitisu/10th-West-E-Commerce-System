import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasSearchableProductText, isUnsafeProductSearch } from '../utils/productSearchSafety.js';

test('injection-shaped searches render the catalog no-results state', async () => {
  for (const input of ["' OR 1=1 --", '<script>alert(1)</script>', 'javascript:alert(1)']) {
    assert.equal(isUnsafeProductSearch(input), true);
  }
  assert.equal(isUnsafeProductSearch('brake'), false);
  const page = await readFile(new URL('../pages/ProductList.jsx', import.meta.url), 'utf8');
  assert.match(page, /if \(isUnsafeProductSearch\(debouncedSearchQuery\)\) return \[\]/);
  assert.match(page, /No products found\./);
});

test('symbol and empty searches do not fall back to the full catalog', async () => {
  for (const input of ['%%%', '###', '😀', '']) assert.equal(hasSearchableProductText(input), false);
  for (const input of ['brake', 'motul']) assert.equal(hasSearchableProductText(input), true);
  const [page, api, navbar] = await Promise.all([
    readFile(new URL('../pages/ProductList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../services/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /searchParams\.has\('search'\) && !hasSearchableProductText\(debouncedSearchQuery\)/);
  assert.match(api, /!hasSearchableProductText\(params\.search\)/);
  assert.match(navbar, /navigate\('\/shop\?search='\)/);
});
