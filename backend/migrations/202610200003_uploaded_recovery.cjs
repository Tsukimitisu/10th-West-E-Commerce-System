exports.up = async knex => {
  await knex.schema.alterTable('backup_records', table => {
    table.string('source', 24).notNullable().defaultTo('system');
    table.timestamp('recovery_expires_at', { useTz: true });
  });
  await knex.raw("ALTER TABLE backup_records ADD CONSTRAINT backup_record_source CHECK (source IN ('system','uploaded_recovery'))");
};
exports.down = async knex => {
  // Never orphan a private uploaded object by removing its cleanup metadata.
  const result = await knex.raw("SELECT 1 FROM backup_records WHERE source='uploaded_recovery' AND deleted_at IS NULL LIMIT 1");
  if (result.rows.length) throw new Error('Remove or retain uploaded recovery records before rolling back this migration.');
  await knex.raw('ALTER TABLE backup_records DROP CONSTRAINT backup_record_source');
  await knex.schema.alterTable('backup_records', table => {
    table.dropColumn('source');
    table.dropColumn('recovery_expires_at');
  });
};
