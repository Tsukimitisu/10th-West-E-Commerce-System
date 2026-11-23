'use strict';

const addColumnIfMissing = async (knex, columnName, defineColumn) => {
  if (!(await knex.schema.hasColumn('orders', columnName))) {
    await knex.schema.alterTable('orders', (table) => defineColumn(table));
  }
};

exports.up = async function up(knex) {
  await addColumnIfMissing(knex, 'shipping_zone', (table) => table.text('shipping_zone'));
  await addColumnIfMissing(knex, 'shipping_coverage', (table) => table.text('shipping_coverage').defaultTo('luzon_only'));
  await addColumnIfMissing(knex, 'base_shipping_fee', (table) => table.decimal('base_shipping_fee', 12, 2).defaultTo(0));
  await addColumnIfMissing(knex, 'weight_surcharge', (table) => table.decimal('weight_surcharge', 12, 2).defaultTo(0));
  await addColumnIfMissing(knex, 'distance_surcharge', (table) => table.decimal('distance_surcharge', 12, 2).defaultTo(0));
  await addColumnIfMissing(knex, 'actual_weight_kg', (table) => table.decimal('actual_weight_kg', 10, 2).defaultTo(0));
  await addColumnIfMissing(knex, 'estimated_distance_km', (table) => table.decimal('estimated_distance_km', 10, 2).defaultTo(0));
  await addColumnIfMissing(knex, 'distance_class', (table) => table.text('distance_class'));
  await addColumnIfMissing(knex, 'package_class', (table) => table.text('package_class'));

  await knex.raw(`
    ALTER TABLE orders ALTER COLUMN shipping_coverage SET DEFAULT 'luzon_only';
    ALTER TABLE orders ALTER COLUMN base_shipping_fee SET DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN weight_surcharge SET DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN distance_surcharge SET DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN actual_weight_kg SET DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN estimated_distance_km SET DEFAULT 0;

    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shipping_breakdown_nonnegative;
    ALTER TABLE orders ADD CONSTRAINT orders_shipping_breakdown_nonnegative CHECK (
      COALESCE(base_shipping_fee, 0) >= 0
      AND COALESCE(weight_surcharge, 0) >= 0
      AND COALESCE(distance_surcharge, 0) >= 0
      AND COALESCE(actual_weight_kg, 0) >= 0
      AND COALESCE(estimated_distance_km, 0) >= 0
    ) NOT VALID;
  `);
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shipping_breakdown_nonnegative');
  for (const column of [
    'package_class', 'distance_class', 'estimated_distance_km', 'actual_weight_kg',
    'distance_surcharge', 'weight_surcharge', 'base_shipping_fee', 'shipping_coverage', 'shipping_zone',
  ]) {
    if (await knex.schema.hasColumn('orders', column)) {
      await knex.schema.alterTable('orders', (table) => table.dropColumn(column));
    }
  }
};
