import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('inventory schema is additive, Box-only, indexed by part number, and links one storefront listing', async () => {
  const migration = await read('../../migrations/202608310001_inventory_storefront_source_of_truth.cjs');
  const mediaGuard = await read('../../migrations/202608310003_require_active_listing_media.cjs');
  assert.match(migration, /store_selling_price/);
  assert.match(migration, /motorcycle_model/);
  assert.match(migration, /box_location/);
  assert.match(migration, /idx_products_part_number_prefix/);
  assert.match(migration, /inventory_item_id.*unique/s);
  assert.match(migration, /ecommerce_listing_media/);
  assert.match(mediaGuard, /visibility_status = 'draft'/);
  assert.doesNotMatch(migration, /dropColumn\(['"](?:rack|rack_location|rack_id|rack_name)/i);
});

test('inventory lookup, receiving transactions, and logical stock constraints are enforced', async () => {
  const [controller, routes, securityMigration] = await Promise.all([
    read('./inventoryController.js'),
    read('../routes/inventory.js'),
    read('../../migrations/202608310002_inventory_storefront_security.cjs'),
  ]);
  assert.match(routes, /inventory\/lookup|['"]\/lookup['"]/);
  assert.match(controller, /LOWER\(p\.part_number\) = LOWER\(\$1\)/);
  assert.match(controller, /PART_NUMBER_NOT_FOUND/);
  assert.match(controller, /supplier_delivery/);
  assert.match(controller, /stock_movements/);
  assert.match(securityMigration, /products_stock_quantity_nonnegative/);
  assert.match(securityMigration, /products_minimum_stock_nonnegative/);
});

test('inventory creation uses managed motorcycle models, returns the created item, and stores color', async () => {
  const [controller, migration, routes] = await Promise.all([
    read('./inventoryController.js'),
    read('../../migrations/202609010001_motorcycle_model_master_and_color.cjs'),
    read('../routes/motorcycleModels.js'),
  ]);
  assert.match(controller, /Motorcycle model is required/);
  assert.match(controller, /MOTORCYCLE_MODEL_NOT_FOUND/);
  assert.match(controller, /motorcycle_model_id/);
  assert.match(controller, /color/);
  assert.match(controller, /item: mapInventoryItem\(created\)/);
  assert.match(migration, /ux_motorcycle_models_name_ci/);
  assert.match(migration, /INSERT INTO motorcycle_models/);
  assert.match(migration, /UPDATE products product/);
  assert.match(routes, /createMotorcycleModel/);
  assert.doesNotMatch(controller, /Category is invalid/);
});

test('inventory creation and receiving reasons are accepted by the database constraint', async () => {
  const migration = await read('../../migrations/202608310004_fix_stock_adjustment_reason_constraint.cjs');
  assert.match(migration, /stock_adjustments_reason_check/);
  assert.match(migration, /initial_stock/);
  assert.match(migration, /supplier_delivery/);
  assert.match(migration, /correction_add/);
  assert.match(migration, /correction_remove/);
  assert.match(migration, /sold_adjustment/);
});

test('storefront listing accepts only extension data and one to ten media items', async () => {
  const source = await read('./ecommerceListingController.js');
  assert.match(source, /FORBIDDEN_CORE_FIELDS/);
  assert.match(source, /INVENTORY_FIELDS_READ_ONLY/);
  assert.match(source, /input\.length > 10/);
  assert.match(source, /active.*media\.length < 1/s);
  assert.match(source, /inventory_item_id/);
  assert.match(source, /calculateEcommercePrice/);
  assert.match(source, /p\.color/);
  assert.match(source, /COALESCE\(model\.model_name, p\.motorcycle_model\)/);
});

test('inventory, storefront, public catalog, and POS search include motorcycle model and color', async () => {
  const [inventory, storefront, products, pos] = await Promise.all([
    read('./inventoryController.js'),
    read('./ecommerceListingController.js'),
    read('./productController.js'),
    read('./posController.js'),
  ]);
  for (const source of [inventory, storefront, products, pos]) {
    assert.match(source, /motorcycle_model/);
    assert.match(source, /color/);
  }
});

test('POS, cart and secure checkout resolve distinct store and online prices from one inventory row', async () => {
  const [pos, cart, checkout, products] = await Promise.all([
    read('./posController.js'),
    read('./cartController.js'),
    read('./secureCheckoutController.js'),
    read('./productController.js'),
  ]);
  assert.match(pos, /COALESCE\(p\.store_selling_price, p\.price\)/);
  assert.match(pos, /'pos_sale'/);
  assert.match(cart, /calculateEcommercePrice\(item\.effective_store_price\)/);
  assert.match(checkout, /calculateEcommercePrice\(baseStorePrice\)/);
  assert.match(checkout, /commitCodReservations/);
  assert.match(checkout, /finalizePaidOrder/);
  assert.match(products, /store_selling_price = COALESCE\(\$4, store_selling_price\)/);
  assert.match(products, /box_location = COALESCE\(\$9, box_location\)/);
});
