'use strict';

const REQUIRED_RUNTIME_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_carts_session_id ON carts(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_cart_items_cart_product ON cart_items(cart_id, product_id)',
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_unique
   ON orders(payment_intent_id)
   WHERE payment_intent_id IS NOT NULL`,
  'CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(review_status)',
  'CREATE INDEX IF NOT EXISTS idx_users_email_change_token ON users(email_change_token)',
  'CREATE INDEX IF NOT EXISTS idx_users_pending_email ON users(pending_email)',
];

exports.up = async function up(knex) {
  // Block concurrent order writes between the duplicate check and unique-index creation.
  await knex.raw('LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE');

  const duplicatePaymentIntents = await knex.raw(`
    SELECT 1
    FROM orders
    WHERE payment_intent_id IS NOT NULL
    GROUP BY payment_intent_id
    HAVING COUNT(*) > 1
    LIMIT 1
  `);

  if (duplicatePaymentIntents.rows.length > 0) {
    const error = new Error(
      'Cannot create idx_orders_payment_intent_unique because duplicate non-null payment intent IDs exist. Resolve the duplicates before retrying this migration.'
    );
    error.code = 'ORDERS_PAYMENT_INTENT_DUPLICATES';
    throw error;
  }

  // Older databases may still carry a uniqueness rule that conflicts with the
  // supported review cooldown model. Fresh migration-only schemas do not.
  await knex.raw(`
    DO $$
    DECLARE
      legacy_constraint text;
    BEGIN
      SELECT c.conname
      INTO legacy_constraint
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.contype = 'u'
        AND t.relname = 'reviews'
        AND n.nspname = 'public'
        AND (
          SELECT array_agg(a.attname ORDER BY a.attname)
          FROM unnest(c.conkey) AS column_number
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = column_number
        ) = ARRAY['product_id', 'user_id']::name[]
      LIMIT 1;

      IF legacy_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT %I', legacy_constraint);
      END IF;
    END $$;
  `);

  for (const statement of REQUIRED_RUNTIME_INDEXES) {
    await knex.raw(statement);
  }
};

exports.down = async function down(knex) {
  for (const indexName of [
    'idx_users_pending_email',
    'idx_users_email_change_token',
    'idx_reviews_status',
    'idx_orders_payment_intent_unique',
    'idx_cart_items_cart_product',
    'idx_carts_session_id',
  ]) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }
  // The obsolete review uniqueness constraint is intentionally not restored:
  // production behavior allows another verified review after the cooldown.
};
