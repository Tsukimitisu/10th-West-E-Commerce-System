const SYSTEM_SETTINGS = [
  { category: 'security', key: 'max_login_attempts', value: '5' },
  { category: 'security', key: 'lockout_duration_minutes', value: '15' },
  { category: 'security', key: 'password_min_length', value: '8' },
  { category: 'security', key: 'password_require_uppercase', value: 'true' },
  { category: 'security', key: 'password_require_lowercase', value: 'true' },
  { category: 'security', key: 'password_require_number', value: 'true' },
  { category: 'security', key: 'password_require_special', value: 'true' },
  { category: 'security', key: 'session_timeout_minutes', value: '30' },
  { category: 'security', key: '2fa_enforcement', value: 'optional' },
  { category: 'home', key: 'announcements_enabled', value: 'true' },
  { category: 'store', key: 'name', value: '10th West Moto' },
  { category: 'store', key: 'tagline', value: 'Motorcycle Parts & Accessories' },
  { category: 'store', key: 'email', value: 'admin@10thwestmoto.com' },
  { category: 'store', key: 'phone', value: '+63 XXX XXX XXXX' },
  { category: 'store', key: 'address', value: 'Manila, Philippines' },
  { category: 'store', key: 'currency', value: 'PHP' },
  { category: 'store', key: 'timezone', value: 'Asia/Manila' },
  { category: 'store', key: 'logo_url', value: '' },
  { category: 'tax', key: 'enabled', value: 'true' },
  { category: 'tax', key: 'rate', value: '12' },
  { category: 'tax', key: 'name', value: 'VAT' },
  { category: 'tax', key: 'inclusive', value: 'true' },
  { category: 'shipping', key: 'free_threshold', value: '3000' },
  { category: 'shipping', key: 'flat_rate', value: '150' },
  { category: 'shipping', key: 'express_rate', value: '350' },
  { category: 'shipping', key: 'enable_pickup', value: 'true' },
  { category: 'payment', key: 'cash_enabled', value: 'true' },
  { category: 'payment', key: 'card_enabled', value: 'true' },
  { category: 'payment', key: 'gcash_enabled', value: 'false' },
  { category: 'payment', key: 'maya_enabled', value: 'false' },
  { category: 'payment', key: 'stripe_pk', value: '' },
  { category: 'payment', key: 'stripe_sk', value: '' },
  { category: 'returns', key: 'return_window_days', value: '15' },
  { category: 'email', key: 'order_confirmation', value: 'true' },
  { category: 'email', key: 'shipping_update', value: 'true' },
  { category: 'email', key: 'return_approval', value: 'true' },
  { category: 'email', key: 'promotions', value: 'false' },
  { category: 'email', key: 'from_name', value: '10th West Moto' },
  { category: 'email', key: 'from_email', value: 'noreply@10thwestmoto.com' },
];

const INDEX_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id)',
  'CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
  'CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
  'CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id)',
  'CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds(return_id)',
  'CREATE INDEX IF NOT EXISTS idx_store_credits_user ON store_credits(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_shipping_option ON products(shipping_option)',
  'CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_product_variants_product_key ON product_variants(product_id, combination_key)',
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_product_variants_product_combination ON product_variants(product_id, combination_key) WHERE combination_key IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_products_variant_options ON products USING GIN (variant_options)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_by ON stock_adjustments(adjusted_by)',
  'CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON stock_adjustments(approved_by)',
  'CREATE INDEX IF NOT EXISTS idx_device_history_user ON device_history(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action)',
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_orders_assigned_staff ON orders(assigned_staff_id)',
  'CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category)',
  'CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type)',
  'CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email)',
  'CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_wishlists_user_product ON wishlists(user_id, product_id)',
];

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

async function createTables(knex) {
  await createTableIfMissing(knex, 'users', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('role', 50).notNullable().defaultTo('customer');
    table.string('phone', 50);
    table.string('avatar', 500);
    table.decimal('store_credit', 10, 2).notNullable().defaultTo(0);
    table.integer('login_attempts').notNullable().defaultTo(0);
    table.timestamp('locked_until');
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('two_factor_enabled').notNullable().defaultTo(false);
    table.string('two_factor_secret', 255);
    table.boolean('email_verified').notNullable().defaultTo(false);
    table.timestamp('consent_given_at');
    table.timestamp('age_confirmed_at');
    table.timestamp('last_login');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'categories', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'subcategories', (table) => {
    table.increments('id').primary();
    table.integer('category_id').references('id').inTable('categories').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'products', (table) => {
    table.increments('id').primary();
    table.string('part_number', 100).unique();
    table.string('name', 255).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.decimal('buying_price', 10, 2);
    table.string('image', 500);
    table.string('video_url', 500);
    table.jsonb('image_urls').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.integer('category_id').references('id').inTable('categories').onDelete('SET NULL');
    table.integer('subcategory_id').references('id').inTable('subcategories').onDelete('SET NULL');
    table.integer('stock_quantity').notNullable().defaultTo(0);
    table.string('shipping_option', 20).notNullable().defaultTo('standard');
    table.decimal('shipping_weight_kg', 10, 3).notNullable().defaultTo(0.1);
    table.jsonb('shipping_dimensions');
    table.string('box_number', 100);
    table.integer('low_stock_threshold').notNullable().defaultTo(5);
    table.string('brand', 100);
    table.string('sku', 100).unique();
    table.string('barcode', 100).unique();
    table.decimal('sale_price', 10, 2);
    table.jsonb('bulk_pricing').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb('variant_options').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.boolean('is_on_sale').notNullable().defaultTo(false);
    table.string('status', 20).notNullable().defaultTo('draft');
    table.date('expiry_date');
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'product_variants', (table) => {
    table.increments('id').primary();
    table.integer('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.string('variant_type', 50).notNullable();
    table.string('variant_value', 100).notNullable();
    table.decimal('price_adjustment', 10, 2).notNullable().defaultTo(0);
    table.decimal('price', 10, 2);
    table.jsonb('option_combination').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.string('combination_key', 255);
    table.string('image_url', 500);
    table.integer('stock_quantity').notNullable().defaultTo(0);
    table.string('sku', 100);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'carts', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'cart_items', (table) => {
    table.increments('id').primary();
    table.integer('cart_id').references('id').inTable('carts').onDelete('CASCADE');
    table.integer('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.integer('quantity').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'orders', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('guest_name', 255);
    table.string('guest_email', 255);
    table.decimal('total_amount', 10, 2).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.text('shipping_address').notNullable();
    table.jsonb('shipping_address_snapshot');
    table.decimal('shipping_lat', 10, 7);
    table.decimal('shipping_lng', 10, 7);
    table.string('source', 20).notNullable().defaultTo('online');
    table.string('payment_method', 20);
    table.decimal('amount_tendered', 10, 2);
    table.decimal('change_due', 10, 2);
    table.integer('cashier_id').references('id').inTable('users').onDelete('SET NULL');
    table.decimal('discount_amount', 10, 2).notNullable().defaultTo(0);
    table.string('promo_code_used', 100);
    table.string('payment_intent_id', 255);
    table.string('tracking_number', 255);
    table.integer('assigned_staff_id').references('id').inTable('users');
    table.decimal('tax_amount', 10, 2).notNullable().defaultTo(0);
    table.string('shipping_method', 50).notNullable().defaultTo('standard');
    table.text('delivery_notes');
    table.date('estimated_delivery');
    table.timestamp('delivered_at');
    table.timestamp('rider_confirmed_delivery_at');
    table.integer('rider_confirmed_by').references('id').inTable('users');
    table.timestamp('customer_confirmed_receipt_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'order_items', (table) => {
    table.increments('id').primary();
    table.integer('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.integer('product_id').references('id').inTable('products').onDelete('SET NULL');
    table.string('product_name', 255).notNullable();
    table.decimal('product_price', 10, 2).notNullable();
    table.integer('quantity').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'addresses', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.string('recipient_name', 255).notNullable();
    table.string('phone', 50).notNullable();
    table.text('street').notNullable();
    table.string('barangay', 100);
    table.string('city', 100).notNullable();
    table.string('state', 100).notNullable();
    table.string('country', 100).notNullable().defaultTo('Philippines');
    table.string('postal_code', 20).notNullable();
    table.text('address_string');
    table.decimal('lat', 10, 7);
    table.decimal('lng', 10, 7);
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'returns', (table) => {
    table.increments('id').primary();
    table.integer('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.text('reason').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.decimal('refund_amount', 10, 2).notNullable();
    table.string('return_type', 20).notNullable().defaultTo('online');
    table.jsonb('items').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'refunds', (table) => {
    table.increments('id').primary();
    table.integer('return_id').references('id').inTable('returns').onDelete('CASCADE');
    table.string('payment_reference', 255);
    table.decimal('amount', 10, 2).notNullable();
    table.string('method', 50).notNullable().defaultTo('original');
    table.timestamp('processed_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'store_credits', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.decimal('amount', 10, 2).notNullable();
    table.string('reason', 255);
    table.integer('reference_id');
    table.string('reference_type', 50);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'support_tickets', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable();
    table.string('subject', 500).notNullable();
    table.text('message').notNullable();
    table.string('status', 50).notNullable().defaultTo('open');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'faqs', (table) => {
    table.increments('id').primary();
    table.text('question').notNullable();
    table.text('answer').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('display_order').notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'policies', (table) => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('content').notNullable();
    table.string('type', 50).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'suppliers', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('contact_person', 255);
    table.string('email', 255);
    table.string('phone', 50);
    table.text('address');
    table.text('notes');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'notifications', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.string('type', 50).notNullable();
    table.string('title', 255).notNullable();
    table.text('message');
    table.boolean('is_read').notNullable().defaultTo(false);
    table.integer('reference_id');
    table.string('reference_type', 50);
    table.string('thumbnail_url', 500);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'banners', (table) => {
    table.increments('id').primary();
    table.string('title', 255);
    table.text('subtitle');
    table.string('image_url', 500);
    table.string('link_url', 500);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('display_order').notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'announcements', (table) => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('content').notNullable();
    table.boolean('is_published').notNullable().defaultTo(false);
    table.timestamp('published_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'stock_adjustments', (table) => {
    table.increments('id').primary();
    table.integer('product_id').references('id').inTable('products');
    table.integer('adjusted_by').references('id').inTable('users');
    table.integer('quantity_change').notNullable();
    table.string('reason', 50);
    table.text('notes');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('approved_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'device_history', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.text('device_info');
    table.string('ip_address', 50);
    table.timestamp('login_at').defaultTo(knex.fn.now());
    table.string('location', 255);
  });

  await createTableIfMissing(knex, 'activity_logs', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('entity_type', 50);
    table.integer('entity_id');
    table.jsonb('details');
    table.string('ip_address', 50);
    table.text('user_agent');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'sessions', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.string('token_hash', 255).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('ip_address', 50);
    table.text('user_agent');
    table.timestamp('last_active').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'wishlists', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('session_id', 255);
    table.integer('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['user_id', 'product_id']);
  });

  await createTableIfMissing(knex, 'reviews', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.integer('rating');
    table.text('comment');
    table.jsonb('media_urls').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.boolean('is_approved').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'discounts', (table) => {
    table.increments('id').primary();
    table.string('code', 100).notNullable().unique();
    table.string('type', 20);
    table.decimal('value', 10, 2).notNullable();
    table.decimal('min_purchase', 10, 2).notNullable().defaultTo(0);
    table.integer('max_uses');
    table.integer('used_count').notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('starts_at');
    table.timestamp('expires_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'shipping_rates', (table) => {
    table.increments('id').primary();
    table.string('method', 50).notNullable();
    table.string('label', 100);
    table.decimal('base_fee', 10, 2).notNullable().defaultTo(0);
    table.decimal('min_purchase_free', 10, 2);
    table.string('estimated_days', 50);
    table.boolean('is_active').notNullable().defaultTo(true);
  });

  await createTableIfMissing(knex, 'system_settings', (table) => {
    table.increments('id').primary();
    table.string('category', 50).notNullable();
    table.string('key', 100).notNullable();
    table.text('value');
    table.integer('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['category', 'key']);
  });

  await createTableIfMissing(knex, 'error_logs', (table) => {
    table.increments('id').primary();
    table.string('error_type', 100).notNullable();
    table.text('message').notNullable();
    table.text('stack_trace');
    table.string('endpoint', 255);
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('ip_address', 50);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'login_attempts', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable();
    table.string('ip_address', 50);
    table.boolean('success').notNullable().defaultTo(false);
    table.text('user_agent');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'backup_history', (table) => {
    table.increments('id').primary();
    table.string('backup_type', 20).notNullable();
    table.string('file_name', 255);
    table.bigInteger('file_size');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('initiated_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('error_message');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

async function ensureCompatibilityColumns(knex) {
  await addColumnIfMissing(knex, 'orders', 'shipping_address_snapshot', (table) => table.jsonb('shipping_address_snapshot'));
  await addColumnIfMissing(knex, 'orders', 'shipping_lat', (table) => table.decimal('shipping_lat', 10, 7));
  await addColumnIfMissing(knex, 'orders', 'shipping_lng', (table) => table.decimal('shipping_lng', 10, 7));

  await addColumnIfMissing(knex, 'addresses', 'country', (table) => table.string('country', 100).defaultTo('Philippines'));
  await addColumnIfMissing(knex, 'addresses', 'barangay', (table) => table.string('barangay', 100));
  await addColumnIfMissing(knex, 'addresses', 'lat', (table) => table.decimal('lat', 10, 7));
  await addColumnIfMissing(knex, 'addresses', 'lng', (table) => table.decimal('lng', 10, 7));

  await addColumnIfMissing(knex, 'products', 'video_url', (table) => table.string('video_url', 500));
  await addColumnIfMissing(knex, 'products', 'image_urls', (table) => table.jsonb('image_urls').defaultTo(knex.raw("'[]'::jsonb")));
  await addColumnIfMissing(knex, 'products', 'bulk_pricing', (table) => table.jsonb('bulk_pricing').defaultTo(knex.raw("'[]'::jsonb")));
  await addColumnIfMissing(knex, 'products', 'variant_options', (table) => table.jsonb('variant_options').defaultTo(knex.raw("'[]'::jsonb")));
  await addColumnIfMissing(knex, 'products', 'shipping_option', (table) => table.string('shipping_option', 20).defaultTo('standard'));
  await addColumnIfMissing(knex, 'products', 'shipping_weight_kg', (table) => table.decimal('shipping_weight_kg', 10, 3).defaultTo(0.1));
  await addColumnIfMissing(knex, 'products', 'shipping_dimensions', (table) => table.jsonb('shipping_dimensions'));
  await addColumnIfMissing(knex, 'products', 'status', (table) => table.string('status', 20).defaultTo('draft'));
  await addColumnIfMissing(knex, 'products', 'expiry_date', (table) => table.date('expiry_date'));
  await addColumnIfMissing(knex, 'products', 'is_deleted', (table) => table.boolean('is_deleted').defaultTo(false));

  await addColumnIfMissing(knex, 'product_variants', 'price', (table) => table.decimal('price', 10, 2));
  await addColumnIfMissing(knex, 'product_variants', 'option_combination', (table) => table.jsonb('option_combination').defaultTo(knex.raw("'{}'::jsonb")));
  await addColumnIfMissing(knex, 'product_variants', 'combination_key', (table) => table.string('combination_key', 255));
  await addColumnIfMissing(knex, 'product_variants', 'image_url', (table) => table.string('image_url', 500));
  await addColumnIfMissing(knex, 'product_variants', 'updated_at', (table) => table.timestamp('updated_at').defaultTo(knex.fn.now()));

  await addColumnIfMissing(knex, 'activity_logs', 'entity_type', (table) => table.string('entity_type', 50));
  await addColumnIfMissing(knex, 'activity_logs', 'entity_id', (table) => table.integer('entity_id'));
  await addColumnIfMissing(knex, 'activity_logs', 'user_agent', (table) => table.text('user_agent'));

  await addColumnIfMissing(knex, 'reviews', 'media_urls', (table) => table.jsonb('media_urls').defaultTo(knex.raw("'[]'::jsonb")));
  await addColumnIfMissing(knex, 'reviews', 'updated_at', (table) => table.timestamp('updated_at').defaultTo(knex.fn.now()));
}

async function createIndexes(knex) {
  for (const statement of INDEX_STATEMENTS) {
    await knex.raw(statement);
  }
}

async function seedDefaults(knex) {
  const tableExists = await knex.schema.hasTable('system_settings');
  if (!tableExists) return;

  await knex('system_settings')
    .insert(SYSTEM_SETTINGS)
    .onConflict(['category', 'key'])
    .ignore();
}

exports.up = async function up(knex) {
  await createTables(knex);
  await ensureCompatibilityColumns(knex);
  await createIndexes(knex);
  await seedDefaults(knex);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('backup_history');
  await knex.schema.dropTableIfExists('login_attempts');
  await knex.schema.dropTableIfExists('error_logs');
  await knex.schema.dropTableIfExists('system_settings');
  await knex.schema.dropTableIfExists('shipping_rates');
  await knex.schema.dropTableIfExists('discounts');
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('wishlists');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('activity_logs');
  await knex.schema.dropTableIfExists('device_history');
  await knex.schema.dropTableIfExists('stock_adjustments');
  await knex.schema.dropTableIfExists('announcements');
  await knex.schema.dropTableIfExists('banners');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('suppliers');
  await knex.schema.dropTableIfExists('policies');
  await knex.schema.dropTableIfExists('faqs');
  await knex.schema.dropTableIfExists('support_tickets');
  await knex.schema.dropTableIfExists('store_credits');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('returns');
  await knex.schema.dropTableIfExists('addresses');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.dropTableIfExists('carts');
  await knex.schema.dropTableIfExists('product_variants');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('subcategories');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('users');
};
