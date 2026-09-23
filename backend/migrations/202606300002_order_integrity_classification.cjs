exports.up = async function up(knex) {
  await knex.schema.alterTable('orders', (table) => {
    table.string('integrity_status', 40).notNullable().defaultTo('valid');
    table.text('integrity_notes');
  });

  await knex.raw(`
    UPDATE orders o
    SET integrity_status = 'integrity_error',
        integrity_notes = 'Legacy order has no order item records'
    WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

    UPDATE orders o
    SET payment_status = 'paid'
    WHERE o.source = 'pos'
      AND EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = o.id AND p.status::text = 'paid'
      );

    UPDATE orders o
    SET receipt_number = 'POS-LEGACY-' || LPAD(o.id::text, 8, '0')
    WHERE o.source = 'pos'
      AND NULLIF(TRIM(o.receipt_number), '') IS NULL
      AND o.payment_status::text = 'paid'
      AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

    UPDATE orders o
    SET integrity_status = 'payment_missing',
        integrity_notes = CONCAT_WS('; ', NULLIF(o.integrity_notes, ''), 'No paid payment record; manual reconciliation required')
    WHERE o.status::text IN ('paid', 'processing', 'packed', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered')
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = o.id AND p.status::text = 'paid'
      );

    UPDATE orders o
    SET integrity_status = 'receipt_missing',
        integrity_notes = CONCAT_WS('; ', NULLIF(o.integrity_notes, ''), 'POS receipt cannot be reconstructed from current evidence')
    WHERE o.source = 'pos'
      AND NULLIF(TRIM(o.receipt_number), '') IS NULL
      AND o.integrity_status = 'valid';

    ALTER TABLE orders
      ADD CONSTRAINT orders_integrity_status_check
      CHECK (integrity_status IN ('valid', 'integrity_error', 'payment_missing', 'receipt_missing', 'manual_review'));

    ALTER TABLE order_items
      ADD CONSTRAINT order_items_product_snapshot_check
      CHECK (product_id IS NOT NULL OR NULLIF(TRIM(product_name), '') IS NOT NULL);

    CREATE INDEX IF NOT EXISTS idx_orders_integrity_status ON orders(integrity_status);
  `);
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_snapshot_check');
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_integrity_status_check');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_integrity_status');
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('integrity_notes');
    table.dropColumn('integrity_status');
  });
};
