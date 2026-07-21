const INTEGRITY_STATUSES = [
  'valid',
  'manual_review',
  'integrity_error',
  'missing_items',
  'payment_missing',
  'receipt_missing',
  'missing_timeline',
  'missing_audit',
];

const statusSql = INTEGRITY_STATUSES.map((status) => `'${status}'`).join(', ');

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_integrity_status_check;
    ALTER TABLE orders
      ADD CONSTRAINT orders_integrity_status_check
      CHECK (integrity_status IN (${statusSql}));

    UPDATE orders o
    SET integrity_status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
            THEN 'missing_items'
          WHEN NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
            THEN 'payment_missing'
          WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
            THEN 'receipt_missing'
          WHEN NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id)
            THEN 'missing_timeline'
          WHEN NOT EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.entity_type = 'order'
                AND al.entity_id = o.id::text
                AND al.action <> 'data.integrity_quarantine'
            )
            THEN 'missing_audit'
          WHEN o.integrity_status IN ('manual_review', 'integrity_error')
            THEN o.integrity_status
          ELSE 'valid'
        END,
        integrity_notes = CASE
          WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
            THEN 'missing_items: legacy order has no order item records; source evidence required'
          WHEN NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
            THEN 'payment_missing: no payment row exists; manual reconciliation required'
          WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
            THEN 'receipt_missing: POS receipt is missing; no receipt was fabricated'
          WHEN NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id)
            THEN 'missing_timeline: order has no status history; transition history unavailable'
          WHEN NOT EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.entity_type = 'order'
                AND al.entity_id = o.id::text
                AND al.action <> 'data.integrity_quarantine'
            )
            THEN 'missing_audit: order has no original audit log evidence'
          WHEN o.integrity_status IN ('manual_review', 'integrity_error')
            THEN COALESCE(NULLIF(o.integrity_notes, ''), 'Manual review required')
          ELSE NULL
        END;

  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    UPDATE orders
    SET integrity_status = CASE
          WHEN integrity_status = 'missing_items' THEN 'integrity_error'
          WHEN integrity_status IN ('missing_timeline', 'missing_audit') THEN 'manual_review'
          ELSE integrity_status
        END
    WHERE integrity_status IN ('missing_items', 'missing_timeline', 'missing_audit');

    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_integrity_status_check;
    ALTER TABLE orders
      ADD CONSTRAINT orders_integrity_status_check
      CHECK (integrity_status IN ('valid', 'integrity_error', 'payment_missing', 'receipt_missing', 'manual_review'));
  `);
};
