exports.up = async function up(knex) {
  const hasOrders = await knex.schema.hasTable('orders');
  if (!hasOrders) return;

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_shipping_method_enum')
         AND NOT EXISTS (
           SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'order_shipping_method_enum'
             AND e.enumlabel = 'jnt'
         ) THEN
        ALTER TYPE order_shipping_method_enum ADD VALUE 'jnt';
      END IF;
    END $$;
  `);

  const addColumnIfMissing = async (column, builder) => {
    const exists = await knex.schema.hasColumn('orders', column);
    if (!exists) {
      await knex.schema.alterTable('orders', (table) => builder(table));
    }
  };

  await addColumnIfMissing('payment_provider', (table) => table.string('payment_provider', 50));
  await addColumnIfMissing('payment_status', (table) => table.string('payment_status', 30).notNullable().defaultTo('pending'));
  await addColumnIfMissing('payment_reference', (table) => table.string('payment_reference', 255));
  await addColumnIfMissing('payment_checkout_url', (table) => table.text('payment_checkout_url'));
  await addColumnIfMissing('payment_metadata', (table) => table.jsonb('payment_metadata'));
  await addColumnIfMissing('paid_at', (table) => table.timestamp('paid_at'));
  await addColumnIfMissing('payment_expires_at', (table) => table.timestamp('payment_expires_at'));

  await knex.raw(`
    UPDATE orders
    SET payment_status = CASE
      WHEN status IN ('paid', 'preparing', 'shipped', 'delivered', 'completed') THEN 'paid'
      WHEN status = 'cancelled' THEN COALESCE(NULLIF(payment_status, ''), 'failed')
      ELSE COALESCE(NULLIF(payment_status, ''), 'pending')
    END
    WHERE payment_status IS NULL OR payment_status = '';

    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'refunded'));

    DROP INDEX IF EXISTS idx_orders_payment_reference;
    CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_provider ON orders(payment_provider);
  `);
};

exports.down = async function down(knex) {
  const hasOrders = await knex.schema.hasTable('orders');
  if (!hasOrders) return;

  await knex.raw(`
    DROP INDEX IF EXISTS idx_orders_payment_provider;
    DROP INDEX IF EXISTS idx_orders_payment_status;
    DROP INDEX IF EXISTS idx_orders_payment_reference;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  `);

  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('payment_expires_at');
    table.dropColumn('paid_at');
    table.dropColumn('payment_metadata');
    table.dropColumn('payment_checkout_url');
    table.dropColumn('payment_reference');
    table.dropColumn('payment_status');
    table.dropColumn('payment_provider');
  });
};
