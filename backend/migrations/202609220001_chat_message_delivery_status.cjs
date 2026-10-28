exports.up = async function up(knex) {
  const hasDeliveredAt = await knex.schema.hasColumn('chat_messages', 'delivered_at');
  if (!hasDeliveredAt) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.timestamp('delivered_at', { useTz: true });
    });
  }

  const hasClientMessageId = await knex.schema.hasColumn('chat_messages', 'client_message_id');
  if (!hasClientMessageId) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.string('client_message_id', 80);
    });
  }

  await knex.raw(`
    UPDATE chat_messages
    SET delivered_at = COALESCE(delivered_at, read_at, seen_at)
    WHERE delivered_at IS NULL AND (read_at IS NOT NULL OR seen_at IS NOT NULL)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_message_id
    ON chat_messages(thread_id, sender_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_chat_messages_client_message_id');
  if (await knex.schema.hasColumn('chat_messages', 'client_message_id')) {
    await knex.schema.alterTable('chat_messages', (table) => table.dropColumn('client_message_id'));
  }
  if (await knex.schema.hasColumn('chat_messages', 'delivered_at')) {
    await knex.schema.alterTable('chat_messages', (table) => table.dropColumn('delivered_at'));
  }
};
