import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('owner product form edits actual product weight_kg', async () => {
  const source = await readFile(new URL('../pages/owner/ProductsView.jsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');

  assert.match(source, /weight_kg:\s*shippingWeightKg/);
  assert.match(source, /value=\{form\.weight_kg\}/);
  assert.match(api, /weight_kg:\s*normalizeProductShippingWeight/);
});
