const PRODUCT_STATUSES = ['draft', 'active', 'out_of_stock', 'archived'];
const PRODUCT_TYPES = ['single', 'bundle'];
const CHAT_THREAD_STATUSES = ['open', 'closed', 'blocked'];
const CHAT_MESSAGE_TYPES = ['text', 'image', 'video', 'system'];

const toSqlList = (values) => values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');

async function createTableIfMissing(knex, tableName, callback) {
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) {
    await knex.schema.createTable(tableName, callback);
  }
}

async function addColumnIfMissing(knex, tableName, columnName, callback) {
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) return;
  const columnExists = await knex.schema.hasColumn(tableName, columnName);
  if (!columnExists) {
    await knex.schema.alterTable(tableName, callback);
  }
}

exports.up = async function up(knex) {
  await knex.raw('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check');
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status_enum') THEN
        ALTER TABLE products ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE products ALTER COLUMN status TYPE varchar(20) USING status::text;
        DROP TYPE product_status_enum;
      END IF;
    END $$;
  `);

  await knex.raw(`
    UPDATE products
    SET status = CASE
      WHEN status IS NULL OR btrim(status::text) = '' THEN 'draft'
      WHEN lower(btrim(status::text)) IN ('published', 'available', 'active') THEN 'active'
      WHEN lower(btrim(status::text)) IN ('out_of_stock', 'out-of-stock', 'sold_out', 'sold out') THEN 'out_of_stock'
      WHEN lower(btrim(status::text)) IN ('archived', 'deleted') THEN 'archived'
      ELSE 'draft'
    END;
  `);
  await knex.raw(`
    ALTER TABLE products
      ALTER COLUMN status SET DEFAULT 'draft',
      ADD CONSTRAINT products_status_check CHECK (status IN (${toSqlList(PRODUCT_STATUSES)}));
  `);

  await addColumnIfMissing(knex, 'products', 'product_type', (table) => table.string('product_type', 20).notNullable().defaultTo('single'));
  await addColumnIfMissing(knex, 'products', 'reserved_stock', (table) => table.integer('reserved_stock').notNullable().defaultTo(0));
  await addColumnIfMissing(knex, 'products', 'damaged_stock', (table) => table.integer('damaged_stock').notNullable().defaultTo(0));
  await addColumnIfMissing(knex, 'products', 'color', (table) => table.string('color', 100));

  await knex.raw(`
    UPDATE products SET product_type = 'single' WHERE product_type IS NULL OR product_type NOT IN (${toSqlList(PRODUCT_TYPES)});
    UPDATE products SET reserved_stock = 0 WHERE reserved_stock IS NULL OR reserved_stock < 0;
    UPDATE products SET damaged_stock = 0 WHERE damaged_stock IS NULL OR damaged_stock < 0;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_nonnegative_check;
    ALTER TABLE products ADD CONSTRAINT products_product_type_check CHECK (product_type IN (${toSqlList(PRODUCT_TYPES)}));
    ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative_check CHECK (stock_quantity >= 0 AND reserved_stock >= 0 AND damaged_stock >= 0);
  `);

  await createTableIfMissing(knex, 'product_fitments', (table) => {
    table.increments('id').primary();
    table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.string('brand', 100).notNullable();
    table.string('model', 100).notNullable();
    table.integer('start_year');
    table.integer('end_year');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'product_bundle_components', (table) => {
    table.increments('id').primary();
    table.integer('bundle_product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.integer('component_product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    table.integer('quantity').notNullable().defaultTo(1);
    table.integer('display_order').notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['bundle_product_id', 'component_product_id']);
  });

  await createTableIfMissing(knex, 'chat_threads', (table) => {
    table.increments('id').primary();
    table.integer('customer_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('assigned_staff_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('order_id').references('id').inTable('orders').onDelete('SET NULL');
    table.integer('product_id').references('id').inTable('products').onDelete('SET NULL');
    table.string('subject', 255);
    table.string('status', 20).notNullable().defaultTo('open');
    table.timestamp('last_message_at');
    table.integer('blocked_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('block_reason');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'chat_participants', (table) => {
    table.increments('id').primary();
    table.integer('thread_id').notNullable().references('id').inTable('chat_threads').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('role', 50).notNullable();
    table.integer('unread_count').notNullable().defaultTo(0);
    table.timestamp('last_read_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['thread_id', 'user_id']);
  });

  await createTableIfMissing(knex, 'chat_messages', (table) => {
    table.increments('id').primary();
    table.integer('thread_id').notNullable().references('id').inTable('chat_threads').onDelete('CASCADE');
    table.integer('sender_id').references('id').inTable('users').onDelete('SET NULL');
    table.text('body');
    table.jsonb('media_urls').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.string('message_type', 20).notNullable().defaultTo('text');
    table.integer('order_id').references('id').inTable('orders').onDelete('SET NULL');
    table.timestamp('seen_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'chat_quick_replies', (table) => {
    table.increments('id').primary();
    table.string('title', 120).notNullable();
    table.text('body').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE product_bundle_components DROP CONSTRAINT IF EXISTS product_bundle_components_quantity_check;
    ALTER TABLE product_bundle_components ADD CONSTRAINT product_bundle_components_quantity_check CHECK (quantity > 0);
    ALTER TABLE product_fitments DROP CONSTRAINT IF EXISTS product_fitments_year_check;
    ALTER TABLE product_fitments ADD CONSTRAINT product_fitments_year_check CHECK (
      (start_year IS NULL OR start_year BETWEEN 1900 AND 2100)
      AND (end_year IS NULL OR end_year BETWEEN 1900 AND 2100)
      AND (start_year IS NULL OR end_year IS NULL OR start_year <= end_year)
    );
    ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_status_check;
    ALTER TABLE chat_threads ADD CONSTRAINT chat_threads_status_check CHECK (status IN (${toSqlList(CHAT_THREAD_STATUSES)}));
    ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check;
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_type_check CHECK (message_type IN (${toSqlList(CHAT_MESSAGE_TYPES)}));
  `);

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_product_fitments_product ON product_fitments(product_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_product_fitments_lookup ON product_fitments(brand, model, start_year, end_year)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle ON product_bundle_components(bundle_product_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_bundle_components_component ON product_bundle_components(component_product_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_products_type_status ON products(product_type, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_customer ON chat_threads(customer_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_assigned ON chat_threads(assigned_staff_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_threads_order ON chat_threads(order_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id)');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('chat_quick_replies');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_participants');
  await knex.schema.dropTableIfExists('chat_threads');
  await knex.schema.dropTableIfExists('product_bundle_components');
  await knex.schema.dropTableIfExists('product_fitments');

  await knex.raw('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check');
  await knex.raw('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_nonnegative_check');
  await knex.raw('ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check');
  await knex.raw(`
    UPDATE products
    SET status = CASE
      WHEN status = 'active' THEN 'published'
      WHEN status IN ('out_of_stock', 'archived') THEN 'draft'
      ELSE status
    END;
    ALTER TABLE products ADD CONSTRAINT products_status_check CHECK (status IN ('draft', 'published'));
  `);
};
