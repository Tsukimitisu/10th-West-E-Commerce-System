const addColumn = async (knex, table, column, builder) => {
  const exists = await knex.schema.hasColumn(table, column);
  if (!exists) {
    await knex.schema.alterTable(table, (t) => builder(t));
  }
};

exports.up = async (knex) => {
  await addColumn(knex, 'orders', 'receipt_number', (t) => t.string('receipt_number', 64));
  await addColumn(knex, 'orders', 'pos_metadata', (t) => t.jsonb('pos_metadata').notNullable().defaultTo('{}'));
  await addColumn(knex, 'orders', 'voided_at', (t) => t.timestamp('voided_at', { useTz: true }));
  await addColumn(knex, 'orders', 'voided_by', (t) => t.integer('voided_by').references('id').inTable('users').onDelete('SET NULL'));
  await addColumn(knex, 'orders', 'void_reason', (t) => t.text('void_reason'));

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_receipt_number
      ON orders(receipt_number)
      WHERE receipt_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_pos_created_at
      ON orders(created_at DESC)
      WHERE source = 'pos';
  `);

  const permissions = [
    ['pos.discount', 'Apply approved promotions in POS', 'POS'],
    ['pos.void', 'Void completed POS transactions', 'POS'],
  ];

  for (const [name, description, category] of permissions) {
    await knex.raw(
      `INSERT INTO permissions (name, description, category)
       VALUES (?, ?, ?)
       ON CONFLICT (name) DO UPDATE
       SET description = EXCLUDED.description, category = EXCLUDED.category`,
      [name, description, category],
    );
  }

  for (const role of ['owner', 'super_admin', 'admin']) {
    await knex.raw(
      `INSERT INTO role_permissions (role, permission_id)
       SELECT ?::user_role_enum, id FROM permissions WHERE name IN ('pos.discount', 'pos.void')
       ON CONFLICT DO NOTHING`,
      [role],
    );
  }
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS idx_orders_pos_created_at');
  await knex.raw('DROP INDEX IF EXISTS ux_orders_receipt_number');
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('void_reason');
    t.dropColumn('voided_by');
    t.dropColumn('voided_at');
    t.dropColumn('pos_metadata');
    t.dropColumn('receipt_number');
  });
  await knex.raw(`DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name IN ('pos.discount', 'pos.void'))`);
  await knex.raw(`DELETE FROM permissions WHERE name IN ('pos.discount', 'pos.void')`);
};
