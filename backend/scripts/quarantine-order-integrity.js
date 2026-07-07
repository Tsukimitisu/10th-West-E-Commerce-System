import pool from '../src/config/database.js';

const apply = process.argv.includes('--apply');

const ISSUE_COUNTS_SQL = `
  SELECT
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)) AS orders_without_items,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)) AS orders_without_payment_rows,
    (SELECT COUNT(*)::int FROM orders
      WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL) AS pos_without_receipt,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id)) AS orders_without_status_history,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.entity_type = 'order'
          AND al.entity_id = o.id::text
          AND al.action <> 'data.integrity_quarantine'
      )) AS orders_without_audit_logs,
    (SELECT COUNT(*)::int FROM order_items WHERE product_id IS NULL) AS order_items_null_product_id,
    (SELECT COUNT(*)::int FROM order_items
      WHERE product_id IS NULL AND NULLIF(TRIM(product_name), '') IS NULL) AS unusable_order_items,
    (SELECT COUNT(*)::int FROM orders WHERE COALESCE(integrity_status, 'valid') <> 'valid') AS non_valid_integrity_statuses,
    (SELECT COUNT(*)::int FROM products p
      WHERE COALESCE(p.stock_quantity, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id)) AS stocked_products_without_movements
`;

const STATUS_COUNTS_SQL = `
  SELECT COALESCE(integrity_status, 'valid') AS integrity_status, COUNT(*)::int AS count
  FROM orders
  GROUP BY COALESCE(integrity_status, 'valid')
  ORDER BY COALESCE(integrity_status, 'valid')
`;

const CLASSIFY_ORDERS_SQL = `
  WITH classified AS (
    SELECT
      o.id,
      o.integrity_status AS previous_status,
      o.integrity_notes AS previous_notes,
      NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id) AS missing_items,
      NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id) AS payment_missing,
      o.source = 'pos' AND NULLIF(TRIM(o.receipt_number), '') IS NULL AS receipt_missing,
      NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id) AS missing_timeline,
      NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.entity_type = 'order'
          AND al.entity_id = o.id::text
          AND al.action <> 'data.integrity_quarantine'
      ) AS missing_audit
    FROM orders o
  ), next_classification AS (
    SELECT
      id,
      previous_status,
      previous_notes,
      CASE
        WHEN missing_items THEN 'missing_items'
        WHEN payment_missing THEN 'payment_missing'
        WHEN receipt_missing THEN 'receipt_missing'
        WHEN missing_timeline THEN 'missing_timeline'
        WHEN missing_audit THEN 'missing_audit'
        WHEN previous_status IN ('manual_review', 'integrity_error') THEN previous_status
        WHEN previous_status IS DISTINCT FROM 'valid' THEN 'manual_review'
        ELSE 'valid'
      END AS next_status,
      array_remove(ARRAY[
        CASE WHEN missing_items THEN 'missing_items' END,
        CASE WHEN payment_missing THEN 'payment_missing' END,
        CASE WHEN receipt_missing THEN 'receipt_missing' END,
        CASE WHEN missing_timeline THEN 'missing_timeline' END,
        CASE WHEN missing_audit THEN 'missing_audit' END
      ], NULL) AS issue_codes,
      array_remove(ARRAY[
        CASE WHEN missing_items THEN 'missing_items: legacy order has no order item records; source evidence required' END,
        CASE WHEN payment_missing THEN 'payment_missing: no payment row exists; manual reconciliation required' END,
        CASE WHEN receipt_missing THEN 'receipt_missing: POS receipt is missing; no receipt was fabricated' END,
        CASE WHEN missing_timeline THEN 'missing_timeline: order has no status history; transition history unavailable' END,
        CASE WHEN missing_audit THEN 'missing_audit: order has no original audit log evidence' END
      ], NULL) AS issue_notes
    FROM classified
  ), updated AS (
    UPDATE orders o
    SET integrity_status = n.next_status,
        integrity_notes = CASE
          WHEN n.next_status = 'valid' THEN NULL
          WHEN array_length(n.issue_notes, 1) > 0 THEN array_to_string(n.issue_notes, '; ')
          ELSE COALESCE(NULLIF(o.integrity_notes, ''), 'Manual review required')
        END
    FROM next_classification n
    WHERE o.id = n.id
      AND (
        o.integrity_status IS DISTINCT FROM n.next_status
        OR COALESCE(o.integrity_notes, '') IS DISTINCT FROM COALESCE(
          CASE
            WHEN n.next_status = 'valid' THEN NULL
            WHEN array_length(n.issue_notes, 1) > 0 THEN array_to_string(n.issue_notes, '; ')
            ELSE COALESCE(NULLIF(o.integrity_notes, ''), 'Manual review required')
          END,
          ''
        )
      )
    RETURNING
      o.id,
      n.previous_status,
      n.previous_notes,
      o.integrity_status,
      o.integrity_notes,
      n.issue_codes
  )
  INSERT INTO audit_logs (
    action, entity_type, entity_id, before_data, after_data, metadata
  )
  SELECT
    'data.integrity_quarantine',
    'order_integrity',
    id::text,
    jsonb_build_object('integrity_status', previous_status, 'integrity_notes', previous_notes),
    jsonb_build_object('integrity_status', integrity_status, 'integrity_notes', integrity_notes),
    jsonb_build_object('issue_codes', issue_codes, 'script', 'quarantine-order-integrity')
  FROM updated
  RETURNING entity_id
`;

const BASELINE_STOCK_SQL = `
  WITH candidates AS (
    SELECT p.id, p.stock_quantity
    FROM products p
    WHERE COALESCE(p.stock_quantity, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id)
  ), inserted AS (
    INSERT INTO stock_movements (
      product_id, quantity_delta, stock_before, stock_after, reason, reference_type, metadata
    )
    SELECT
      id,
      stock_quantity,
      0,
      stock_quantity,
      'legacy_baseline',
      'data_integrity',
      jsonb_build_object(
        'source', 'quarantine-order-integrity',
        'note', 'Baseline movement from current stock_quantity; prior movement history unavailable'
      )
    FROM candidates
    RETURNING product_id, stock_after
  )
  INSERT INTO audit_logs (
    action, entity_type, entity_id, before_data, after_data, metadata
  )
  SELECT
    'inventory.baseline_import',
    'product',
    product_id::text,
    jsonb_build_object('stock_quantity', NULL),
    jsonb_build_object('stock_quantity', stock_after),
    jsonb_build_object(
      'script', 'quarantine-order-integrity',
      'note', 'Baseline stock movement created from current product stock; prior movement history unavailable'
    )
  FROM inserted
  RETURNING entity_id
`;

const queryCounts = async (client) => {
  const [issues, statuses] = await Promise.all([
    client.query(ISSUE_COUNTS_SQL),
    client.query(STATUS_COUNTS_SQL),
  ]);
  return {
    issues: issues.rows[0],
    statuses: statuses.rows,
  };
};

const client = await pool.connect();

try {
  const before = await queryCounts(client);

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry_run',
      message: 'No records changed. Pass --apply to classify order integrity gaps and create safe stock baselines.',
      before,
    }, null, 2));
  } else {
    await client.query('BEGIN');
    const classified = await client.query(CLASSIFY_ORDERS_SQL);
    const baselined = await client.query(BASELINE_STOCK_SQL);
    await client.query('COMMIT');

    const after = await queryCounts(client);
    console.log(JSON.stringify({
      mode: 'apply',
      orders_classified: classified.rowCount,
      stock_baselines_created: baselined.rowCount,
      before,
      after,
    }, null, 2));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Unable to quarantine order integrity gaps: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
