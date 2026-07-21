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
    (SELECT COUNT(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id IS NULL AND COALESCE(o.integrity_status, 'valid') = 'valid') AS unquarantined_null_product_items,
    (SELECT COUNT(*)::int FROM orders WHERE receipt_number LIKE 'POS-LEGACY-%') AS fabricated_legacy_receipts,
    (SELECT COALESCE(SUM(duplicates - 1), 0)::int FROM (
      SELECT COUNT(*)::int AS duplicates FROM orders
      WHERE NULLIF(TRIM(receipt_number), '') IS NOT NULL
      GROUP BY receipt_number HAVING COUNT(*) > 1
    ) duplicate_groups) AS duplicate_receipts,
    (SELECT COUNT(*)::int FROM products
      WHERE stock_quantity < 0 OR reserved_stock < 0 OR reserved_stock > stock_quantity) AS invalid_product_stock,
    (SELECT COUNT(*)::int FROM product_variants
      WHERE stock_quantity < 0 OR reserved_stock < 0 OR reserved_stock > stock_quantity) AS invalid_variant_stock,
    (SELECT COUNT(*)::int FROM orders o
      WHERE o.payment_method = 'cod'
        AND COALESCE(o.integrity_status, 'valid') = 'valid'
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.method='cod')) AS valid_cod_orders_without_payment,
    (SELECT COUNT(*)::int FROM orders o
      WHERE o.source = 'pos'
        AND COALESCE(o.integrity_status, 'valid') = 'valid'
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid')) AS valid_pos_orders_without_paid_payment,
    (SELECT COUNT(*)::int FROM order_items oi LEFT JOIN orders o ON o.id=oi.order_id WHERE o.id IS NULL) AS orphan_order_items,
    (SELECT COUNT(*)::int FROM payments p LEFT JOIN orders o ON o.id=p.order_id WHERE o.id IS NULL) AS orphan_payments,
    (SELECT COUNT(*)::int FROM stock_reservations sr
      LEFT JOIN orders o ON o.id=sr.order_id LEFT JOIN products p ON p.id=sr.product_id
      WHERE o.id IS NULL OR p.id IS NULL) AS orphan_stock_reservations,
    (SELECT COUNT(*)::int FROM stock_movements sm LEFT JOIN products p ON p.id=sm.product_id WHERE p.id IS NULL) AS orphan_stock_movements,
    (SELECT COUNT(*)::int FROM returns r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN users u ON u.id=r.user_id
      WHERE o.id IS NULL OR u.id IS NULL) AS orphan_returns,
    (SELECT COUNT(*)::int FROM return_items ri
      LEFT JOIN returns r ON r.id=ri.return_id LEFT JOIN order_items oi ON oi.id=ri.order_item_id
      WHERE r.id IS NULL OR oi.id IS NULL) AS orphan_return_items,
    (SELECT COUNT(*)::int FROM chat_messages cm LEFT JOIN chat_threads ct ON ct.id=cm.thread_id WHERE ct.id IS NULL) AS orphan_chat_messages,
    (SELECT COUNT(*)::int FROM chat_participants cp LEFT JOIN chat_threads ct ON ct.id=cp.thread_id WHERE ct.id IS NULL) AS orphan_chat_participants,
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
  audit.unquarantined_null_product_items,
  audit.fabricated_legacy_receipts,
  audit.duplicate_receipts,
  audit.invalid_product_stock,
  audit.invalid_variant_stock,
  audit.valid_cod_orders_without_payment,
  audit.valid_pos_orders_without_paid_payment,
  audit.orphan_order_items,
  audit.orphan_payments,
  audit.orphan_stock_reservations,
  audit.orphan_stock_movements,
  audit.orphan_returns,
  audit.orphan_return_items,
  audit.orphan_chat_messages,
  audit.orphan_chat_participants,
  audit.stocked_products_without_movements,
].reduce((total, value) => total + value, 0);

console.log(JSON.stringify({ ...audit, status: failures === 0 ? 'passed' : 'failed' }, null, 2));
if (failures > 0) process.exitCode = 1;
await pool.end();
