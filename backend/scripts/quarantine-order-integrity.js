import pool from '../src/config/database.js';

const apply = process.argv.includes('--apply');
const before = await pool.query(`
  SELECT integrity_status, COUNT(*)::int AS count
  FROM orders
  GROUP BY integrity_status
  ORDER BY integrity_status
`);

if (!apply) {
  console.log(JSON.stringify({
    mode: 'dry_run',
    message: 'No records changed. Pass --apply to re-run deterministic quarantine classification.',
    before: before.rows,
  }, null, 2));
  await pool.end();
  process.exit(0);
}

const result = await pool.query(`
  UPDATE orders o
  SET integrity_status = CASE
        WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
          THEN 'integrity_error'
        WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
          THEN 'receipt_missing'
        WHEN o.status::text IN (
            'paid', 'processing', 'packed', 'ready_for_pickup',
            'shipped', 'out_for_delivery', 'delivered'
          )
          AND NOT EXISTS (
            SELECT 1 FROM payments p
            WHERE p.order_id = o.id AND p.status::text = 'paid'
          )
          THEN 'payment_missing'
        WHEN o.integrity_status = 'manual_review' THEN 'manual_review'
        ELSE 'valid'
      END,
      integrity_notes = CASE
        WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
          THEN 'Legacy order has no order item records; source evidence required'
        WHEN o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL
          THEN 'POS receipt is missing; no receipt was fabricated'
        WHEN o.status::text IN (
            'paid', 'processing', 'packed', 'ready_for_pickup',
            'shipped', 'out_for_delivery', 'delivered'
          )
          AND NOT EXISTS (
            SELECT 1 FROM payments p
            WHERE p.order_id = o.id AND p.status::text = 'paid'
          )
          THEN 'No paid payment record; manual reconciliation required'
        WHEN o.integrity_status = 'manual_review'
          THEN COALESCE(NULLIF(o.integrity_notes, ''), 'Manual review required')
        ELSE NULL
      END
  RETURNING id
`);

const after = await pool.query(`
  SELECT integrity_status, COUNT(*)::int AS count
  FROM orders
  GROUP BY integrity_status
  ORDER BY integrity_status
`);

console.log(JSON.stringify({
  mode: 'apply',
  rows_classified: result.rowCount,
  before: before.rows,
  after: after.rows,
}, null, 2));
await pool.end();
