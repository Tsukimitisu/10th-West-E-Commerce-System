exports.up = async (knex) => {
  const hasStatus = await knex.schema.hasColumn('discount_usages', 'status');
  if (!hasStatus) {
    await knex.schema.alterTable('discount_usages', (table) => {
      table.string('status', 20).notNullable().defaultTo('consumed');
      table.timestamp('released_at');
      table.string('release_reason', 255);
    });
  }
  await knex.raw(`
    ALTER TABLE discount_usages DROP CONSTRAINT IF EXISTS discount_usages_status_check;
    ALTER TABLE discount_usages ADD CONSTRAINT discount_usages_status_check
      CHECK (status IN ('consumed', 'released'));
    CREATE INDEX IF NOT EXISTS idx_discount_usages_active
      ON discount_usages(discount_id, user_id) WHERE status = 'consumed';
  `);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS idx_discount_usages_active');
  await knex.schema.alterTable('discount_usages', (table) => {
    table.dropColumn('release_reason');
    table.dropColumn('released_at');
    table.dropColumn('status');
  });
};
