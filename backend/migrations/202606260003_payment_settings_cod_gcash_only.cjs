exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('system_settings'))) return;

  await knex.raw(`
    DELETE FROM system_settings
    WHERE category = 'payment'
      AND key IN ('card_enabled', 'maya_enabled', 'stripe_pk', 'stripe_sk')
  `);

  await knex('system_settings')
    .insert([
      { category: 'payment', key: 'cash_enabled', value: 'true' },
      { category: 'payment', key: 'gcash_enabled', value: 'true' },
    ])
    .onConflict(['category', 'key'])
    .merge({ value: knex.raw('EXCLUDED.value') });
};

exports.down = async function down() {
  // Do not restore unsupported provider settings.
};
