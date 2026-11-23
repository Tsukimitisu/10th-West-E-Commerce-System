exports.up = async knex => {
  await knex.schema.alterTable('users', table => {
    table.integer('login_lock_stage').notNullable().defaultTo(0);
    table.timestamp('login_security_locked_at', { useTz: true });
  });
  await knex.raw('ALTER TABLE users ADD CONSTRAINT users_login_lock_stage_check CHECK (login_lock_stage BETWEEN 0 AND 3)');
  await knex.schema.createTable('password_reset_sms_challenges', table => {
    // One row per account preserves send quotas even after a challenge is used.
    table.integer('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('id').notNullable().unique();
    table.text('code_hash').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('consumed_at', { useTz: true });
    table.timestamp('window_started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.integer('send_count').notNullable().defaultTo(1);
    table.boolean('delivery_accepted').notNullable().defaultTo(false);
  });
  await knex.raw('ALTER TABLE password_reset_sms_challenges ENABLE ROW LEVEL SECURITY');
  await knex.raw('REVOKE ALL ON password_reset_sms_challenges FROM PUBLIC, anon, authenticated');
};

exports.down = async knex => {
  await knex.schema.dropTable('password_reset_sms_challenges');
  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_login_lock_stage_check');
  await knex.schema.alterTable('users', table => {
    table.dropColumn('login_lock_stage');
    table.dropColumn('login_security_locked_at');
  });
};
