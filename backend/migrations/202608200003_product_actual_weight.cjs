'use strict';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('products', 'weight_kg'))) {
    await knex.schema.alterTable('products', (table) => {
      table.decimal('weight_kg', 10, 2).notNullable().defaultTo(1);
    });
  }

  await knex.raw(`
    UPDATE products
    SET weight_kg = CASE
      WHEN shipping_weight_kg IS NOT NULL AND shipping_weight_kg > 0 THEN shipping_weight_kg
      WHEN weight_kg IS NOT NULL AND weight_kg > 0 THEN weight_kg
      ELSE 1
    END;

    ALTER TABLE products ALTER COLUMN weight_kg SET DEFAULT 1;
    ALTER TABLE products ALTER COLUMN weight_kg SET NOT NULL;

    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weight_kg_positive;
    ALTER TABLE products
      ADD CONSTRAINT products_weight_kg_positive CHECK (weight_kg > 0) NOT VALID;
  `);
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('products', 'weight_kg')) {
    await knex.schema.alterTable('products', (table) => table.dropColumn('weight_kg'));
  }
};
