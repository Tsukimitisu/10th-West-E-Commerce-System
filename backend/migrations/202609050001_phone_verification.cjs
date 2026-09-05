exports.up = async (knex) => {
  await knex.schema.createTable('phone_verifications', (table) => {
    table.integer('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    table.text('phone').notNullable();
    table.text('code_hash').nullable();
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('last_sent_at', { useTz: true });
    table.timestamp('window_started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.integer('send_count').notNullable().defaultTo(0);
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('verified_at', { useTz: true });
    table.boolean('delivery_accepted').notNullable().defaultTo(false);
  });
  await knex.raw('ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY');
  await knex.raw('REVOKE ALL ON phone_verifications FROM PUBLIC, anon, authenticated');
};

exports.down = async (knex) => {
  await knex.schema.dropTable('phone_verifications');
};
