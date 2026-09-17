import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isUnsafeProductSearch } from '../utils/productSearchSafety.js';

test('injection-shaped searches render the catalog no-results state', async () => {
  for (const input of ["' OR 1=1 --", '<script>alert(1)</script>', 'javascript:alert(1)']) {
    assert.equal(isUnsafeProductSearch(input), true);
  }
  assert.equal(isUnsafeProductSearch('brake'), false);
  const page = await readFile(new URL('../pages/ProductList.jsx', import.meta.url), 'utf8');
  assert.match(page, /if \(isUnsafeProductSearch\(debouncedSearchQuery\)\) return \[\]/);
  assert.match(page, /No products found\./);
});
