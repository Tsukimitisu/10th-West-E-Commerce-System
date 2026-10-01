const CHAT_THREAD_STATUSES = ['open', 'closed', 'blocked', 'archived'];
const CHAT_MESSAGE_TYPES = ['text', 'image', 'video', 'file', 'system'];

const toSqlList = (values) => values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');

async function addColumnIfMissing(knex, tableName, columnName, callback) {
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) return;

  const columnExists = await knex.schema.hasColumn(tableName, columnName);
  if (!columnExists) {
    await knex.schema.alterTable(tableName, callback);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(knex, 'chat_threads', 'seller_id', (table) => {
    table.integer('seller_id').references('id').inTable('users').onDelete('SET NULL');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'variant_id', (table) => {
    table.integer('variant_id').references('id').inTable('product_variants').onDelete('SET NULL');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'conversation_type', (table) => {
    table.string('conversation_type', 30).notNullable().defaultTo('product');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'product_snapshot', (table) => {
    table.jsonb('product_snapshot').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
  });
  await addColumnIfMissing(knex, 'chat_threads', 'is_pinned', (table) => {
    table.boolean('is_pinned').notNullable().defaultTo(false);
  });
  await addColumnIfMissing(knex, 'chat_threads', 'buyer_archived_at', (table) => {
    table.timestamp('buyer_archived_at');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'seller_archived_at', (table) => {
    table.timestamp('seller_archived_at');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'last_message_id', (table) => {
    table.integer('last_message_id').references('id').inTable('chat_messages').onDelete('SET NULL');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'last_message_text', (table) => {
    table.text('last_message_text');
  });
  await addColumnIfMissing(knex, 'chat_threads', 'buyer_unread_count', (table) => {
    table.integer('buyer_unread_count').notNullable().defaultTo(0);
  });
  await addColumnIfMissing(knex, 'chat_threads', 'seller_unread_count', (table) => {
    table.integer('seller_unread_count').notNullable().defaultTo(0);
  });

  await addColumnIfMissing(knex, 'chat_participants', 'conversation_id', (table) => {
    table.integer('conversation_id').references('id').inTable('chat_threads').onDelete('CASCADE');
  });
  await addColumnIfMissing(knex, 'chat_participants', 'muted', (table) => {
    table.boolean('muted').notNullable().defaultTo(false);
  });
  await addColumnIfMissing(knex, 'chat_participants', 'archived_at', (table) => {
    table.timestamp('archived_at');
  });

  await addColumnIfMissing(knex, 'chat_messages', 'conversation_id', (table) => {
    table.integer('conversation_id').references('id').inTable('chat_threads').onDelete('CASCADE');
  });
  await addColumnIfMissing(knex, 'chat_messages', 'receiver_id', (table) => {
    table.integer('receiver_id').references('id').inTable('users').onDelete('SET NULL');
  });
  await addColumnIfMissing(knex, 'chat_messages', 'sender_role', (table) => {
    table.string('sender_role', 50);
  });
  await addColumnIfMissing(knex, 'chat_messages', 'message_text', (table) => {
    table.text('message_text');
  });
  await addColumnIfMissing(knex, 'chat_messages', 'attachment_url', (table) => {
    table.string('attachment_url', 500);
  });
  await addColumnIfMissing(knex, 'chat_messages', 'attachment_type', (table) => {
    table.string('attachment_type', 30);
  });
  await addColumnIfMissing(knex, 'chat_messages', 'metadata', (table) => {
    table.jsonb('metadata').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
  });
  await addColumnIfMissing(knex, 'chat_messages', 'is_read', (table) => {
    table.boolean('is_read').notNullable().defaultTo(false);
  });
  await addColumnIfMissing(knex, 'chat_messages', 'read_at', (table) => {
    table.timestamp('read_at');
  });
  await addColumnIfMissing(knex, 'chat_messages', 'updated_at', (table) => {
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing(knex, 'chat_messages', 'deleted_at', (table) => {
    table.timestamp('deleted_at');
  });

  const hasAttachments = await knex.schema.hasTable('chat_attachments');
  if (!hasAttachments) {
    await knex.schema.createTable('chat_attachments', (table) => {
      table.increments('id').primary();
      table.integer('message_id').notNullable().references('id').inTable('chat_messages').onDelete('CASCADE');
      table.integer('conversation_id').notNullable().references('id').inTable('chat_threads').onDelete('CASCADE');
      table.string('url', 500).notNullable();
      table.string('type', 30).notNullable().defaultTo('file');
      table.string('filename', 255);
      table.integer('size_bytes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    UPDATE chat_participants
    SET conversation_id = thread_id
    WHERE conversation_id IS NULL;

    UPDATE chat_messages
    SET conversation_id = thread_id,
        message_text = COALESCE(message_text, body),
        is_read = COALESCE(is_read, seen_at IS NOT NULL),
        read_at = COALESCE(read_at, seen_at),
        updated_at = COALESCE(updated_at, created_at);

    UPDATE chat_messages
    SET conversation_id = chat_messages.thread_id,
        message_text = COALESCE(chat_messages.message_text, chat_messages.body),
        sender_role = COALESCE(chat_messages.sender_role, u.role::text),
        is_read = COALESCE(chat_messages.is_read, chat_messages.seen_at IS NOT NULL),
        read_at = COALESCE(chat_messages.read_at, chat_messages.seen_at),
        updated_at = COALESCE(chat_messages.updated_at, chat_messages.created_at)
    FROM users u
    WHERE chat_messages.sender_id = u.id;

    WITH latest AS (
      SELECT DISTINCT ON (thread_id)
        thread_id,
        id,
        COALESCE(message_text, body, '') AS body,
        created_at
      FROM chat_messages
      WHERE deleted_at IS NULL
      ORDER BY thread_id, created_at DESC, id DESC
    )
    UPDATE chat_threads ct
    SET last_message_id = latest.id,
        last_message_text = latest.body,
        last_message_at = COALESCE(ct.last_message_at, latest.created_at),
        updated_at = GREATEST(COALESCE(ct.updated_at, latest.created_at), latest.created_at)
    FROM latest
    WHERE latest.thread_id = ct.id;

    UPDATE chat_threads
    SET conversation_type = COALESCE(conversation_type, 'product'),
        product_snapshot = COALESCE(product_snapshot, '{}'::jsonb),
        buyer_unread_count = GREATEST(0, COALESCE(buyer_unread_count, 0)),
        seller_unread_count = GREATEST(0, COALESCE(seller_unread_count, 0));

    ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_status_check;
    ALTER TABLE chat_threads ADD CONSTRAINT chat_threads_status_check CHECK (status IN (${toSqlList(CHAT_THREAD_STATUSES)}));
    ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check;
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_type_check CHECK (message_type IN (${toSqlList(CHAT_MESSAGE_TYPES)}));
  `);

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_product_variant ON chat_threads(product_id, variant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_seller ON chat_threads(seller_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_pinned_updated ON chat_threads(is_pinned DESC, updated_at DESC)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_messages_unread_receiver ON chat_messages(receiver_id, is_read) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation ON chat_attachments(conversation_id)');

  await knex.raw(`
    CREATE OR REPLACE VIEW chat_conversations AS
    SELECT
      id,
      customer_id AS buyer_id,
      seller_id,
      assigned_staff_id,
      product_id,
      variant_id,
      order_id,
      subject,
      status,
      conversation_type,
      product_snapshot,
      is_pinned,
      buyer_archived_at,
      seller_archived_at,
      last_message_id,
      last_message_text,
      last_message_at,
      buyer_unread_count,
      seller_unread_count,
      created_at,
      updated_at
    FROM chat_threads;
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS chat_conversations');
  await knex.schema.dropTableIfExists('chat_attachments');

  await knex.raw(`
    ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_status_check;
    UPDATE chat_threads SET status = 'closed' WHERE status = 'archived';
    ALTER TABLE chat_threads ADD CONSTRAINT chat_threads_status_check CHECK (status IN ('open', 'closed', 'blocked'));
    ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check;
    UPDATE chat_messages SET message_type = 'system' WHERE message_type = 'file';
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_type_check CHECK (message_type IN ('text', 'image', 'video', 'system'));
  `);

  const threadColumns = [
    'seller_id',
    'variant_id',
    'conversation_type',
    'product_snapshot',
    'is_pinned',
    'buyer_archived_at',
    'seller_archived_at',
    'last_message_id',
    'last_message_text',
    'buyer_unread_count',
    'seller_unread_count',
  ];

  for (const column of threadColumns) {
    await knex.schema.alterTable('chat_threads', (table) => {
      table.dropColumn(column);
    });
  }

  const participantColumns = ['conversation_id', 'muted', 'archived_at'];
  for (const column of participantColumns) {
    await knex.schema.alterTable('chat_participants', (table) => {
      table.dropColumn(column);
    });
  }

  const messageColumns = [
    'conversation_id',
    'receiver_id',
    'sender_role',
    'message_text',
    'attachment_url',
    'attachment_type',
    'metadata',
    'is_read',
    'read_at',
    'updated_at',
    'deleted_at',
  ];

  for (const column of messageColumns) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.dropColumn(column);
    });
  }
};
