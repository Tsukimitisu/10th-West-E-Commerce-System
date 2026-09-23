import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(directory, '../../migrations/202608200003_product_actual_weight.cjs');

test('product actual weight migration adds a safe positive weight_kg default', async () => {
  const source = await readFile(migrationPath, 'utf8');
  assert.match(source, /decimal\('weight_kg', 10, 2\)\.notNullable\(\)\.defaultTo\(1\)/);
  assert.match(source, /shipping_weight_kg IS NOT NULL AND shipping_weight_kg > 0 THEN shipping_weight_kg/);
  assert.match(source, /CHECK \(weight_kg > 0\)/);
  assert.doesNotMatch(source, /volumetric|chargeable_weight|length_cm|width_cm|height_cm/i);
});
