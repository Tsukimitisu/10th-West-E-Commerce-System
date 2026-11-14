exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('order_items'))) return;

  if (!(await knex.schema.hasColumn('order_items', 'price'))) {
    await knex.schema.alterTable('order_items', (table) => {
      table.decimal('price', 10, 2);
    });
  }

  await knex.raw(`
    UPDATE order_items
    SET price = product_price
    WHERE price IS NULL AND product_price IS NOT NULL;

    ALTER TABLE order_items
      ALTER COLUMN price DROP NOT NULL;
  `);
};

exports.down = async function down() {
  // Intentionally keep the compatibility column; dropping it could break older
  // rows or admin reports that still read order_items.price.
};
