const addColumnIfMissing = async (knex, tableName, columnName, defineColumn) => {
  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, (table) => defineColumn(table));
  }
};

const dropColumnIfPresent = async (knex, tableName, columnName) => {
  if (await knex.schema.hasColumn(tableName, columnName)) {
    await knex.schema.alterTable(tableName, (table) => table.dropColumn(columnName));
  }
};

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('shipments')) {
    await addColumnIfMissing(knex, 'shipments', 'shipping_provider', (table) => table.string('shipping_provider', 40));
    await addColumnIfMissing(knex, 'shipments', 'tracking_provider', (table) => table.string('tracking_provider', 40));
    await addColumnIfMissing(knex, 'shipments', 'provider_tracking_id', (table) => table.string('provider_tracking_id', 255));
    await addColumnIfMissing(knex, 'shipments', 'waybill_number', (table) => table.string('waybill_number', 100));
    await addColumnIfMissing(knex, 'shipments', 'label_url', (table) => table.text('label_url'));
    await addColumnIfMissing(knex, 'shipments', 'provider_status', (table) => table.string('provider_status', 100));
    await addColumnIfMissing(knex, 'shipments', 'normalized_status', (table) => table.string('normalized_status', 40));
    await addColumnIfMissing(knex, 'shipments', 'last_tracking_refresh_at', (table) => table.timestamp('last_tracking_refresh_at'));
    await addColumnIfMissing(knex, 'shipments', 'webhook_received_at', (table) => table.timestamp('webhook_received_at'));
    await addColumnIfMissing(knex, 'shipments', 'booking_error', (table) => table.text('booking_error'));
    await knex.raw(`
      UPDATE shipments
      SET shipping_provider = CASE WHEN lower(provider) = 'jnt' THEN 'legacy' ELSE lower(provider) END,
          normalized_status = lower(status),
          provider_status = lower(status)
      WHERE shipping_provider IS NULL
    `);
    await knex.raw(`
      ALTER TABLE shipments ALTER COLUMN shipping_provider SET NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_shipments_shipping_provider ON shipments(shipping_provider, normalized_status);
      CREATE INDEX IF NOT EXISTS idx_shipments_tracking_provider_id ON shipments(tracking_provider, provider_tracking_id);
    `);
  }

  if (await knex.schema.hasTable('waybills')) {
    await addColumnIfMissing(knex, 'waybills', 'provider', (table) => table.string('provider', 40));
    await addColumnIfMissing(knex, 'waybills', 'label_url', (table) => table.text('label_url'));
    await addColumnIfMissing(knex, 'waybills', 'last_reprinted_at', (table) => table.timestamp('last_reprinted_at'));
    await knex.raw(`
      UPDATE waybills w
      SET provider = s.shipping_provider
      FROM shipments s
      WHERE w.shipment_id = s.id AND w.provider IS NULL
    `);
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('waybills')) {
    await dropColumnIfPresent(knex, 'waybills', 'last_reprinted_at');
    await dropColumnIfPresent(knex, 'waybills', 'label_url');
    await dropColumnIfPresent(knex, 'waybills', 'provider');
  }
  if (await knex.schema.hasTable('shipments')) {
    await dropColumnIfPresent(knex, 'shipments', 'booking_error');
    await dropColumnIfPresent(knex, 'shipments', 'webhook_received_at');
    await dropColumnIfPresent(knex, 'shipments', 'last_tracking_refresh_at');
    await dropColumnIfPresent(knex, 'shipments', 'normalized_status');
    await dropColumnIfPresent(knex, 'shipments', 'provider_status');
    await dropColumnIfPresent(knex, 'shipments', 'label_url');
    await dropColumnIfPresent(knex, 'shipments', 'waybill_number');
    await dropColumnIfPresent(knex, 'shipments', 'provider_tracking_id');
    await dropColumnIfPresent(knex, 'shipments', 'tracking_provider');
    await dropColumnIfPresent(knex, 'shipments', 'shipping_provider');
  }
};
