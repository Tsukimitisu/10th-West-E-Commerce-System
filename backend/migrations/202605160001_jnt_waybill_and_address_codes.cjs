exports.up = async function up(knex) {
  const addColumnIfMissing = async (tableName, columnName, callback) => {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    if (!exists) {
      await knex.schema.alterTable(tableName, (table) => callback(table));
    }
  };

  await addColumnIfMissing('addresses', 'province_code', (table) => table.string('province_code', 20));
  await addColumnIfMissing('addresses', 'city_code', (table) => table.string('city_code', 20));
  await addColumnIfMissing('addresses', 'barangay_code', (table) => table.string('barangay_code', 20));

  await addColumnIfMissing('orders', 'courier', (table) => table.string('courier', 50));
  await addColumnIfMissing('orders', 'waybill_number', (table) => table.string('waybill_number', 100));
  await addColumnIfMissing('orders', 'waybill_status', (table) => table.string('waybill_status', 30).notNullable().defaultTo('not_requested'));
  await addColumnIfMissing('orders', 'waybill_generated_at', (table) => table.timestamp('waybill_generated_at'));
  await addColumnIfMissing('orders', 'waybill_label_payload', (table) => table.jsonb('waybill_label_payload'));
  await addColumnIfMissing('orders', 'courier_metadata', (table) => table.jsonb('courier_metadata'));

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_addresses_psgc_codes ON addresses(province_code, city_code, barangay_code)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_waybill_number ON orders(waybill_number)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_courier_status ON orders(courier, waybill_status)');
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_orders_courier_status');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_waybill_number');
  await knex.raw('DROP INDEX IF EXISTS idx_addresses_psgc_codes');

  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('courier_metadata');
    table.dropColumn('waybill_label_payload');
    table.dropColumn('waybill_generated_at');
    table.dropColumn('waybill_status');
    table.dropColumn('waybill_number');
    table.dropColumn('courier');
  });

  await knex.schema.alterTable('addresses', (table) => {
    table.dropColumn('barangay_code');
    table.dropColumn('city_code');
    table.dropColumn('province_code');
  });
};
