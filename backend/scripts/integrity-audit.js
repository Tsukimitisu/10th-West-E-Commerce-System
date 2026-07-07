import pool from '../src/config/database.js';

const result = await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)) AS orders_without_items,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
        AND COALESCE(o.integrity_status, 'valid') = 'valid') AS unquarantined_orders_without_items,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)) AS orders_without_payment_rows,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
        AND COALESCE(o.integrity_status, 'valid') = 'valid') AS unquarantined_orders_without_payment_rows,
    (SELECT COUNT(*)::int FROM orders
      WHERE integrity_status = 'payment_missing') AS payment_missing,
    (SELECT COUNT(*)::int FROM orders
      WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL) AS pos_without_receipt,
    (SELECT COUNT(*)::int FROM orders
      WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL
        AND COALESCE(integrity_status, 'valid') = 'valid') AS unquarantined_pos_without_receipt,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id)) AS orders_without_status_history,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id)
        AND COALESCE(o.integrity_status, 'valid') = 'valid') AS unquarantined_orders_without_status_history,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.entity_type = 'order'
          AND al.entity_id = o.id::text
          AND al.action <> 'data.integrity_quarantine'
      )) AS orders_without_audit_logs,
    (SELECT COUNT(*)::int FROM orders o
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.entity_type = 'order'
          AND al.entity_id = o.id::text
          AND al.action <> 'data.integrity_quarantine'
      )
        AND COALESCE(o.integrity_status, 'valid') = 'valid') AS unquarantined_orders_without_audit_logs,
    (SELECT COUNT(*)::int FROM order_items WHERE product_id IS NULL) AS legacy_null_product_items,
    (SELECT COUNT(*)::int FROM order_items
      WHERE product_id IS NULL AND NULLIF(TRIM(product_name), '') IS NULL) AS unusable_order_items,
    (SELECT COUNT(*)::int FROM orders WHERE receipt_number LIKE 'POS-LEGACY-%') AS fabricated_legacy_receipts,
    (SELECT COUNT(*)::int FROM orders WHERE COALESCE(integrity_status, 'valid') <> 'valid') AS quarantined_orders,
    (SELECT COUNT(*)::int FROM orders WHERE COALESCE(integrity_status, 'valid') = 'valid') AS valid_orders,
    (SELECT COUNT(*)::int FROM products p
      WHERE COALESCE(p.stock_quantity, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id)) AS stocked_products_without_movements
`);

const audit = Object.fromEntries(
  Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])
);

const failures = [
  audit.unquarantined_orders_without_items,
  audit.unquarantined_orders_without_payment_rows,
  audit.unquarantined_pos_without_receipt,
  audit.unquarantined_orders_without_status_history,
  audit.unquarantined_orders_without_audit_logs,
  audit.unusable_order_items,
  audit.fabricated_legacy_receipts,
  audit.stocked_products_without_movements,
].reduce((total, value) => total + value, 0);

console.log(JSON.stringify({ ...audit, status: failures === 0 ? 'passed' : 'failed' }, null, 2));
if (failures > 0) process.exitCode = 1;
await pool.end();
