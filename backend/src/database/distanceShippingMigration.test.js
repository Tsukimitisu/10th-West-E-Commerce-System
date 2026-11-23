import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(directory, '../../migrations/202608200004_order_distance_shipping_details.cjs');

test('order migration persists the complete actual-weight distance shipping breakdown', async () => {
  const source = await readFile(migrationPath, 'utf8');
  for (const column of [
    'shipping_zone', 'shipping_coverage', 'base_shipping_fee', 'weight_surcharge',
    'distance_surcharge', 'actual_weight_kg', 'estimated_distance_km',
    'distance_class', 'package_class',
  ]) {
    assert.match(source, new RegExp(`['\"]${column}['\"]`));
  }
  assert.doesNotMatch(source, /volumetric|chargeable_weight|length_cm|width_cm|height_cm/i);
});
