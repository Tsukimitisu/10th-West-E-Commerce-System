exports.up = async function up(knex) {
  if (await knex.schema.hasTable('shipments')) {
    await knex.schema.alterTable('shipments', (table) => {
      table.string('shipping_provider', 40);
      table.string('tracking_provider', 40);
      table.string('provider_tracking_id', 255);
      table.string('waybill_number', 100);
      table.text('label_url');
      table.string('provider_status', 100);
      table.string('normalized_status', 40);
      table.timestamp('last_tracking_refresh_at');
      table.timestamp('webhook_received_at');
      table.text('booking_error');
    });
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
    await knex.schema.alterTable('waybills', (table) => {
      table.string('provider', 40);
      table.text('label_url');
      table.timestamp('last_reprinted_at');
    });
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
    await knex.schema.alterTable('waybills', (table) => {
      table.dropColumn('last_reprinted_at');
      table.dropColumn('label_url');
      table.dropColumn('provider');
    });
  }
  if (await knex.schema.hasTable('shipments')) {
    await knex.schema.alterTable('shipments', (table) => {
      table.dropColumn('booking_error');
      table.dropColumn('webhook_received_at');
      table.dropColumn('last_tracking_refresh_at');
      table.dropColumn('normalized_status');
      table.dropColumn('provider_status');
      table.dropColumn('label_url');
      table.dropColumn('waybill_number');
      table.dropColumn('provider_tracking_id');
      table.dropColumn('tracking_provider');
      table.dropColumn('shipping_provider');
    });
  }
};
