// Additive only. Existing banner records and legacy URLs are preserved.
exports.up = async function up(knex) {
  const additions = {
    button_text: table => table.string('button_text', 48),
    destination_type: table => table.string('destination_type', 24).notNullable().defaultTo('legacy'),
    destination_id: table => table.integer('destination_id'),
    starts_at: table => table.timestamp('starts_at', { useTz: true }),
    ends_at: table => table.timestamp('ends_at', { useTz: true }),
    alt_text: table => table.string('alt_text', 255),
  };
  for (const [column, add] of Object.entries(additions)) {
    if (!await knex.schema.hasColumn('banners', column)) await knex.schema.alterTable('banners', add);
  }
};

exports.down = async function down(knex) {
  // Keep button_text because it predates this feature in deployed environments.
  for (const column of ['destination_type', 'destination_id', 'starts_at', 'ends_at', 'alt_text']) {
    if (await knex.schema.hasColumn('banners', column)) await knex.schema.alterTable('banners', table => table.dropColumn(column));
  }
};
