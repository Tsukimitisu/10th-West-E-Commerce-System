exports.up = async (knex) => {
  const hasCodes = await knex.schema.hasColumn('users', 'two_factor_recovery_hashes');
  if (!hasCodes) {
    await knex.schema.alterTable('users', (table) => {
      table.jsonb('two_factor_recovery_hashes').notNullable().defaultTo('[]');
    });
  }
  await knex.raw(`
    ALTER TABLE users ALTER COLUMN two_factor_secret TYPE text;
    UPDATE users
    SET two_factor_enabled=false, two_factor_secret=NULL, two_factor_recovery_hashes='[]'::jsonb
    WHERE two_factor_secret IS NOT NULL AND two_factor_secret NOT LIKE 'v1.%';
  `);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('two_factor_recovery_hashes');
  });
};
