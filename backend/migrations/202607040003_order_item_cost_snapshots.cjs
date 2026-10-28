exports.up = async (knex) => {
  const exists = await knex.schema.hasColumn('order_items', 'unit_cost_snapshot');
  if (!exists) {
    await knex.schema.alterTable('order_items', (table) => {
      table.decimal('unit_cost_snapshot', 12, 2);
    });
  }
  await knex.raw(`
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_cost_snapshot_check;
    ALTER TABLE order_items ADD CONSTRAINT order_items_cost_snapshot_check
      CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0);
  `);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('order_items', (table) => {
    table.dropColumn('unit_cost_snapshot');
  });
};
