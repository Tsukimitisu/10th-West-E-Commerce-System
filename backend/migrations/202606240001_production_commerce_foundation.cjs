const ORDER_STATUSES = [
  'pending', 'payment_pending', 'paid', 'processing', 'packed', 'ready_for_pickup',
  'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested',
  'return_approved', 'return_rejected', 'returned', 'refund_processing', 'refunded',
  'partially_refunded', 'failed',
];

const PRIVATE_TABLES = [
  'users', 'sessions', 'registration_otps', 'oauth_codes', 'permissions',
  'role_permissions', 'user_permissions', 'addresses', 'carts', 'cart_items',
  'orders', 'order_items', 'order_status_history', 'payments', 'payment_events',
  'payment_attempts', 'payment_reconciliations', 'returns', 'return_items', 'refunds',
  'refund_attempts', 'shipments', 'shipment_events', 'waybills', 'stock_movements',
  'stock_reservations', 'notifications', 'notification_deliveries', 'audit_logs',
  'activity_logs', 'discount_usages', 'idempotency_keys', 'chat_threads',
  'chat_participants', 'chat_messages',
];

async function createTable(knex, name, callback) {
  if (!(await knex.schema.hasTable(name))) await knex.schema.createTable(name, callback);
}

async function addColumn(knex, tableName, columnName, callback) {
  if (await knex.schema.hasTable(tableName) && !(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, callback);
  }
}

exports.up = async function up(knex) {
  // Keep workflow values explicit and extensible. The legacy enum omitted most real
  // fulfilment states, so use a constrained varchar instead.
  await knex.raw(`
    ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE orders ALTER COLUMN status TYPE varchar(40) USING status::text;
    UPDATE orders SET status = 'processing' WHERE status = 'preparing';
    UPDATE orders SET status = 'delivered' WHERE status = 'completed';
    ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN (${ORDER_STATUSES.map((s) => `'${s}'`).join(', ')}));

    UPDATE returns SET status = 'approved' WHERE status::text = 'exchanged';
    ALTER TABLE returns ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE returns ALTER COLUMN status TYPE varchar(40) USING status::text;
    ALTER TABLE returns ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
    ALTER TABLE returns ADD CONSTRAINT returns_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'received', 'refund_processing', 'refunded', 'cancelled'));

    ALTER TABLE refunds ALTER COLUMN method DROP DEFAULT;
    ALTER TABLE refunds ALTER COLUMN method TYPE varchar(40) USING method::text;
    ALTER TABLE refunds ALTER COLUMN method SET DEFAULT 'original';
  `);

  await addColumn(knex, 'cart_items', 'variant_id', (t) => t.integer('variant_id').references('id').inTable('product_variants').onDelete('CASCADE'));
  await addColumn(knex, 'order_items', 'variant_id', (t) => t.integer('variant_id').references('id').inTable('product_variants').onDelete('SET NULL'));
  await addColumn(knex, 'order_items', 'sku_snapshot', (t) => t.string('sku_snapshot', 100));
  await addColumn(knex, 'order_items', 'variant_name_snapshot', (t) => t.string('variant_name_snapshot', 255));
  await addColumn(knex, 'order_items', 'image_snapshot', (t) => t.string('image_snapshot', 500));
  await addColumn(knex, 'order_items', 'returned_quantity', (t) => t.integer('returned_quantity').notNullable().defaultTo(0));

  await addColumn(knex, 'orders', 'address_id', (t) => t.integer('address_id').references('id').inTable('addresses').onDelete('SET NULL'));
  await addColumn(knex, 'orders', 'subtotal_amount', (t) => t.decimal('subtotal_amount', 12, 2).notNullable().defaultTo(0));
  await addColumn(knex, 'orders', 'shipping_fee', (t) => t.decimal('shipping_fee', 12, 2).notNullable().defaultTo(0));
  await addColumn(knex, 'orders', 'currency', (t) => t.string('currency', 3).notNullable().defaultTo('PHP'));
  await addColumn(knex, 'orders', 'checkout_idempotency_key', (t) => t.string('checkout_idempotency_key', 255));
  await addColumn(knex, 'orders', 'cancelled_at', (t) => t.timestamp('cancelled_at'));
  await addColumn(knex, 'orders', 'cancellation_reason', (t) => t.text('cancellation_reason'));

  await addColumn(knex, 'product_variants', 'reserved_stock', (t) => t.integer('reserved_stock').notNullable().defaultTo(0));
  await addColumn(knex, 'discounts', 'max_discount', (t) => t.decimal('max_discount', 12, 2));
  await addColumn(knex, 'discounts', 'per_user_limit', (t) => t.integer('per_user_limit').notNullable().defaultTo(1));
  await addColumn(knex, 'discounts', 'updated_at', (t) => t.timestamp('updated_at').defaultTo(knex.fn.now()));
  await addColumn(knex, 'discounts', 'deleted_at', (t) => t.timestamp('deleted_at'));

  await addColumn(knex, 'returns', 'evidence_urls', (t) => t.jsonb('evidence_urls').notNullable().defaultTo(knex.raw("'[]'::jsonb")));
  await addColumn(knex, 'returns', 'refund_method', (t) => t.string('refund_method', 40).notNullable().defaultTo('original'));
  await addColumn(knex, 'returns', 'reviewed_by', (t) => t.integer('reviewed_by').references('id').inTable('users').onDelete('SET NULL'));
  await addColumn(knex, 'returns', 'reviewed_at', (t) => t.timestamp('reviewed_at'));
  await addColumn(knex, 'returns', 'review_note', (t) => t.text('review_note'));

  await addColumn(knex, 'refunds', 'status', (t) => t.string('status', 30).notNullable().defaultTo('pending'));
  await addColumn(knex, 'refunds', 'provider', (t) => t.string('provider', 40));
  await addColumn(knex, 'refunds', 'provider_refund_id', (t) => t.string('provider_refund_id', 255));
  await addColumn(knex, 'refunds', 'idempotency_key', (t) => t.string('idempotency_key', 255));
  await addColumn(knex, 'refunds', 'updated_at', (t) => t.timestamp('updated_at').defaultTo(knex.fn.now()));

  await createTable(knex, 'product_images', (t) => {
    t.increments('id').primary();
    t.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.integer('variant_id').references('id').inTable('product_variants').onDelete('CASCADE');
    t.string('url', 500).notNullable();
    t.string('alt_text', 255);
    t.integer('display_order').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'order_status_history', (t) => {
    t.bigIncrements('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('from_status', 40);
    t.string('to_status', 40).notNullable();
    t.string('source', 40).notNullable().defaultTo('system');
    t.integer('changed_by').references('id').inTable('users').onDelete('SET NULL');
    t.text('note');
    t.jsonb('metadata');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'payments', (t) => {
    t.bigIncrements('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('RESTRICT');
    t.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('provider', 40).notNullable();
    t.string('method', 40).notNullable();
    t.string('status', 30).notNullable().defaultTo('pending');
    t.decimal('amount', 12, 2).notNullable();
    t.string('currency', 3).notNullable().defaultTo('PHP');
    t.string('external_checkout_id', 255);
    t.string('external_payment_id', 255);
    t.string('reference', 255);
    t.jsonb('metadata');
    t.timestamp('expires_at');
    t.timestamp('paid_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'payment_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('payment_id').references('id').inTable('payments').onDelete('SET NULL');
    t.string('provider', 40).notNullable();
    t.string('external_event_id', 255).notNullable();
    t.string('event_type', 100).notNullable();
    t.string('processing_status', 30).notNullable().defaultTo('received');
    t.jsonb('payload').notNullable();
    t.text('error_message');
    t.timestamp('processed_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['provider', 'external_event_id']);
  });

  await createTable(knex, 'payment_attempts', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.string('idempotency_key', 255).notNullable().unique();
    t.string('status', 30).notNullable().defaultTo('started');
    t.integer('http_status');
    t.jsonb('provider_response');
    t.text('error_message');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at');
  });

  await createTable(knex, 'payment_reconciliations', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.string('result', 30).notNullable();
    t.decimal('expected_amount', 12, 2).notNullable();
    t.decimal('received_amount', 12, 2);
    t.string('expected_currency', 3).notNullable();
    t.string('received_currency', 3);
    t.jsonb('details');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'idempotency_keys', (t) => {
    t.bigIncrements('id').primary();
    t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('scope', 80).notNullable();
    t.string('key', 255).notNullable();
    t.string('request_hash', 64).notNullable();
    t.string('status', 20).notNullable().defaultTo('processing');
    t.integer('response_status');
    t.jsonb('response_body');
    t.timestamp('expires_at').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'scope', 'key']);
  });

  await createTable(knex, 'stock_reservations', (t) => {
    t.bigIncrements('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.integer('variant_id').references('id').inTable('product_variants').onDelete('RESTRICT');
    t.integer('quantity').notNullable();
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamp('expires_at');
    t.timestamp('released_at');
    t.timestamp('committed_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'stock_movements', (t) => {
    t.bigIncrements('id').primary();
    t.integer('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.integer('variant_id').references('id').inTable('product_variants').onDelete('RESTRICT');
    t.integer('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.integer('quantity_delta').notNullable();
    t.integer('stock_before').notNullable();
    t.integer('stock_after').notNullable();
    t.string('reason', 40).notNullable();
    t.string('reference_type', 40);
    t.bigInteger('reference_id');
    t.integer('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.jsonb('metadata');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'shipments', (t) => {
    t.bigIncrements('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('RESTRICT').unique();
    t.string('provider', 40).notNullable();
    t.string('status', 40).notNullable().defaultTo('pending');
    t.string('provider_shipment_id', 255);
    t.string('tracking_number', 255);
    t.decimal('shipping_fee', 12, 2).notNullable().defaultTo(0);
    t.string('currency', 3).notNullable().defaultTo('PHP');
    t.string('booking_idempotency_key', 255).notNullable().unique();
    t.jsonb('provider_metadata');
    t.timestamp('booked_at');
    t.timestamp('cancelled_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'shipment_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    t.string('provider_event_id', 255);
    t.string('status', 40).notNullable();
    t.string('location', 255);
    t.text('description');
    t.jsonb('payload');
    t.timestamp('occurred_at').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['shipment_id', 'provider_event_id']);
  });

  await createTable(knex, 'waybills', (t) => {
    t.bigIncrements('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('RESTRICT').unique();
    t.bigInteger('shipment_id').references('id').inTable('shipments').onDelete('SET NULL');
    t.string('waybill_number', 100).notNullable().unique();
    t.string('status', 30).notNullable().defaultTo('generated');
    t.jsonb('label_payload').notNullable();
    t.integer('generated_by').references('id').inTable('users').onDelete('SET NULL');
    t.integer('reprint_count').notNullable().defaultTo(0);
    t.timestamp('last_printed_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'return_items', (t) => {
    t.bigIncrements('id').primary();
    t.integer('return_id').notNullable().references('id').inTable('returns').onDelete('CASCADE');
    t.integer('order_item_id').notNullable().references('id').inTable('order_items').onDelete('RESTRICT');
    t.integer('quantity').notNullable();
    t.text('reason');
    t.decimal('refund_amount', 12, 2).notNullable();
    t.unique(['return_id', 'order_item_id']);
  });

  await createTable(knex, 'refund_attempts', (t) => {
    t.bigIncrements('id').primary();
    t.integer('refund_id').notNullable().references('id').inTable('refunds').onDelete('CASCADE');
    t.string('idempotency_key', 255).notNullable().unique();
    t.string('status', 30).notNullable().defaultTo('started');
    t.string('provider_reference', 255);
    t.jsonb('provider_response');
    t.text('error_message');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at');
  });

  await createTable(knex, 'discount_usages', (t) => {
    t.bigIncrements('id').primary();
    t.integer('discount_id').notNullable().references('id').inTable('discounts').onDelete('RESTRICT');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('RESTRICT').unique();
    t.decimal('amount', 12, 2).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'notification_deliveries', (t) => {
    t.bigIncrements('id').primary();
    t.integer('notification_id').references('id').inTable('notifications').onDelete('CASCADE');
    t.string('channel', 20).notNullable();
    t.string('recipient', 255).notNullable();
    t.string('status', 20).notNullable().defaultTo('queued');
    t.integer('attempt_count').notNullable().defaultTo(0);
    t.timestamp('next_attempt_at');
    t.text('last_error');
    t.string('provider_message_id', 255);
    t.timestamp('sent_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'audit_logs', (t) => {
    t.bigIncrements('id').primary();
    t.integer('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('action', 100).notNullable();
    t.string('entity_type', 80).notNullable();
    t.string('entity_id', 100);
    t.string('ip_address', 50);
    t.text('user_agent');
    t.jsonb('before_data');
    t.jsonb('after_data');
    t.jsonb('metadata');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await createTable(knex, 'http_sessions', (t) => {
    t.string('sid').primary();
    t.jsonb('sess').notNullable();
    t.timestamp('expire', { useTz: true }).notNullable();
  });

  await knex.raw(`
    UPDATE orders SET subtotal_amount = GREATEST(0, total_amount - COALESCE(tax_amount, 0) + COALESCE(discount_amount, 0))
      WHERE subtotal_amount = 0;
    UPDATE orders SET currency = 'PHP' WHERE currency IS NULL OR currency <> 'PHP';
    UPDATE product_variants SET reserved_stock = LEAST(stock_quantity, GREATEST(0, COALESCE(reserved_stock, 0)));

    ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_reserved_stock_check;
    ALTER TABLE product_variants ADD CONSTRAINT product_variants_reserved_stock_check CHECK (reserved_stock >= 0 AND reserved_stock <= stock_quantity);
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_amounts_non_negative_check;
    ALTER TABLE orders ADD CONSTRAINT orders_amounts_non_negative_check CHECK (
      subtotal_amount >= 0 AND shipping_fee >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
    );
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_check;
    ALTER TABLE orders ADD CONSTRAINT orders_currency_check CHECK (currency = 'PHP');
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (
      payment_status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded')
    );
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_returned_quantity_check;
    ALTER TABLE order_items ADD CONSTRAINT order_items_returned_quantity_check CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);
    ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_quantity_check CHECK (quantity > 0);
    ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_status_check CHECK (status IN ('active', 'committed', 'released', 'expired'));
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stock_check CHECK (stock_before >= 0 AND stock_after >= 0 AND stock_after = stock_before + quantity_delta);
    ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount >= 0 AND currency = 'PHP');
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded'));
    ALTER TABLE refunds ADD CONSTRAINT refunds_status_check CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled'));
    ALTER TABLE return_items ADD CONSTRAINT return_items_quantity_check CHECK (quantity > 0 AND refund_amount >= 0);
    ALTER TABLE discounts ADD CONSTRAINT discounts_limits_check CHECK (
      min_purchase >= 0 AND (max_discount IS NULL OR max_discount >= 0) AND per_user_limit > 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_addresses_one_default_per_user ON addresses(user_id) WHERE is_default = true AND user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_checkout_idempotency ON orders(user_id, checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_external_checkout ON payments(provider, external_checkout_id) WHERE external_checkout_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_external_payment ON payments(provider, external_payment_id) WHERE external_payment_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_refunds_idempotency ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_order_history_order_created ON order_status_history(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_reservations_expiry ON stock_reservations(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_shipment_events_timeline ON shipment_events(shipment_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_queue ON notification_deliveries(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_http_sessions_expire ON http_sessions(expire);
  `);

  const permissions = [
    ['suppliers.view', 'View suppliers', 'Suppliers'], ['suppliers.manage', 'Manage suppliers', 'Suppliers'],
    ['payments.view', 'View payments', 'Payments'], ['payments.refund', 'Process payment refunds', 'Payments'],
    ['shipments.view', 'View shipments', 'Shipments'], ['shipments.manage', 'Book and manage shipments', 'Shipments'],
    ['waybills.manage', 'Generate and reprint waybills', 'Shipments'], ['promotions.manage', 'Manage promotions', 'Promotions'],
    ['notifications.manage', 'Manage notification delivery', 'Notifications'], ['audit.view', 'View audit logs', 'Security'],
  ];
  await knex('permissions').insert(permissions.map(([name, description, category]) => ({ name, description, category }))).onConflict('name').ignore();
  await knex.raw(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT r.role::user_role_enum, p.id
    FROM (VALUES ('admin'), ('super_admin'), ('owner')) AS r(role)
    CROSS JOIN permissions p
    ON CONFLICT (role, permission_id) DO NOTHING;
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'store_staff'::user_role_enum, id FROM permissions
    WHERE name IN ('shipments.view', 'shipments.manage', 'waybills.manage', 'suppliers.view', 'payments.view')
    ON CONFLICT (role, permission_id) DO NOTHING;
  `);

  // The browser no longer talks to Supabase. Remove every existing policy on private
  // tables and permit only service-role JWTs; the application DB owner retains access.
  await knex.raw(`
    DO $secure$
    DECLARE table_name text; policy_name text;
    BEGIN
      FOREACH table_name IN ARRAY ARRAY[${PRIVATE_TABLES.map((t) => `'${t}'`).join(', ')}]
      LOOP
        IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
        FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
        LOOP
          EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
        END LOOP;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL USING (current_setting(''request.jwt.claim.role'', true) = ''service_role'') WITH CHECK (current_setting(''request.jwt.claim.role'', true) = ''service_role'')',
          table_name || '_service_role_only', table_name
        );
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', table_name);
        END IF;
      END LOOP;
    END $secure$;
  `);
};

exports.down = async function down(knex) {
  // This migration intentionally does not restore insecure RLS policies.
  for (const name of PRIVATE_TABLES) {
    if (await knex.schema.hasTable(name)) await knex.raw(`DROP POLICY IF EXISTS ${name}_service_role_only ON ${name}`);
  }
  for (const table of [
    'audit_logs', 'notification_deliveries', 'discount_usages', 'refund_attempts', 'return_items',
    'waybills', 'shipment_events', 'shipments', 'stock_movements', 'stock_reservations',
    'idempotency_keys', 'payment_reconciliations', 'payment_attempts', 'payment_events', 'payments',
    'order_status_history', 'product_images', 'http_sessions',
  ]) await knex.schema.dropTableIfExists(table);
};
