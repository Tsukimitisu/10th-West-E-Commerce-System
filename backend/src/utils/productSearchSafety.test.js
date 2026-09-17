import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasSearchableProductText, isUnsafeProductSearch } from './productSearchSafety.js';

test('script and SQL control payloads cannot become broad product searches', async () => {
  for (const input of ["' OR 1=1 --", '<script>alert(1)</script>', 'javascript:alert(1)', 'brake; DROP TABLE products']) {
    assert.equal(isUnsafeProductSearch(input), true, input);
  }
  for (const input of ['brake', 'motul', 'BB3-123', 'side panel']) {
    assert.equal(isUnsafeProductSearch(input), false, input);
  }
  const controller = await readFile(new URL('../controllers/productController.js', import.meta.url), 'utf8');
  assert.match(controller, /if \(isUnsafeProductSearch\(search\)\) return res\.json\(\[\]\)/);
  assert.match(controller, /p\.name ILIKE \$\$\{containsIdx\}/);
});

test('symbol, emoji, and explicit empty queries have no searchable product terms', async () => {
  for (const input of ['%%%', '###', '😀', '', '--']) {
    assert.equal(hasSearchableProductText(input), false, input);
  }
  for (const input of ['brake', 'motul', 'BB3-123']) {
    assert.equal(hasSearchableProductText(input), true, input);
  }
  const controller = await readFile(new URL('../controllers/productController.js', import.meta.url), 'utf8');
  assert.match(controller, /hasOwnProperty\.call\(queryInput, 'search'\) && !hasSearchableProductText\(search\)/);
});
