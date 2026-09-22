exports.up = async function up(knex) {
  const usersExists = await knex.schema.hasTable('users');
  if (!usersExists) return;

  const columns = [
    ['last_email_verification_token', (table) => table.string('last_email_verification_token', 255)],
    ['last_email_verification_at', (table) => table.timestamp('last_email_verification_at', { useTz: true })],
    ['email_verification_sent_at', (table) => table.timestamp('email_verification_sent_at', { useTz: true })],
  ];

  for (const [columnName, addColumn] of columns) {
    if (!await knex.schema.hasColumn('users', columnName)) {
      await knex.schema.alterTable('users', addColumn);
    }
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_users_last_email_verification_token
      ON users(last_email_verification_token)
      WHERE last_email_verification_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_email_verification_sent_at
      ON users(email_verification_sent_at)
      WHERE email_verification_sent_at IS NOT NULL;
  `);
};

exports.down = async function down(knex) {
  const usersExists = await knex.schema.hasTable('users');
  if (!usersExists) return;

  await knex.raw('DROP INDEX IF EXISTS idx_users_email_verification_sent_at');
  await knex.raw('DROP INDEX IF EXISTS idx_users_last_email_verification_token');

  for (const columnName of [
    'email_verification_sent_at',
    'last_email_verification_at',
    'last_email_verification_token',
  ]) {
    if (await knex.schema.hasColumn('users', columnName)) {
      await knex.schema.alterTable('users', (table) => table.dropColumn(columnName));
    }
  }
};
