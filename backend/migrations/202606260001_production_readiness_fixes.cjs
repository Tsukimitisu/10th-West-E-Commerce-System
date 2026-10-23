exports.up = async function up(knex) {
  if (await knex.schema.hasTable('addresses')) {
    if (!(await knex.schema.hasColumn('addresses', 'address_string'))) {
      await knex.schema.alterTable('addresses', (table) => {
        table.text('address_string');
      });
    }

    await knex.raw(`
      UPDATE addresses
      SET address_string = concat_ws(
        ', ',
        NULLIF(street, ''),
        NULLIF(barangay, ''),
        NULLIF(city, ''),
        NULLIF(trim(concat_ws(' ', NULLIF(state, ''), NULLIF(postal_code, ''))), ''),
        'Philippines'
      )
      WHERE address_string IS NULL OR btrim(address_string) = ''
    `);
  }

  if (!(await knex.schema.hasTable('request_rate_limits'))) {
    await knex.schema.createTable('request_rate_limits', (table) => {
      table.text('key').primary();
      table.integer('request_count').notNullable().defaultTo(0);
      table.timestamp('reset_at', { useTz: true }).notNullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_request_rate_limits_reset
      ON request_rate_limits(reset_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_active
      ON sessions(expires_at, is_active);
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
      ON idempotency_keys(expires_at);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_status
      ON notification_deliveries(created_at, status);
  `);

  if (await knex.schema.hasTable('system_settings')) {
    await knex.raw(`
      DELETE FROM system_settings
      WHERE category = 'payment'
        AND key IN ('stripe_pk', 'stripe_sk')
        AND COALESCE(value, '') = ''
    `);
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('request_rate_limits');
};
