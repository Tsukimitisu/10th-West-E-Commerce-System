import pool from '../src/config/database.js';

const result = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)) AS orders_without_items,
    (SELECT COUNT(*) FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
        AND integrity_status = 'valid') AS unquarantined_orders_without_items,
    (SELECT COUNT(*) FROM orders WHERE integrity_status = 'payment_missing') AS payment_missing,
    (SELECT COUNT(*) FROM orders WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL) AS pos_without_receipt,
    (SELECT COUNT(*) FROM orders
      WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL
        AND integrity_status = 'valid') AS unquarantined_pos_without_receipt,
    (SELECT COUNT(*) FROM order_items WHERE product_id IS NULL AND NULLIF(TRIM(product_name), '') IS NULL) AS unusable_order_items,
    (SELECT COUNT(*) FROM order_items WHERE product_id IS NULL) AS legacy_null_product_items,
    (SELECT COUNT(*) FROM orders WHERE receipt_number LIKE 'POS-LEGACY-%') AS fabricated_legacy_receipts,
    (SELECT COUNT(*) FROM orders WHERE integrity_status <> 'valid') AS quarantined_orders,
    (SELECT COUNT(*) FROM orders WHERE integrity_status = 'valid') AS valid_orders
`);

const audit = Object.fromEntries(
  Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])
);
const failures = [
  audit.unquarantined_orders_without_items,
  audit.unquarantined_pos_without_receipt,
  audit.unusable_order_items,
  audit.fabricated_legacy_receipts,
].reduce((total, value) => total + value, 0);

console.log(JSON.stringify({ ...audit, status: failures === 0 ? 'passed' : 'failed' }, null, 2));
if (failures > 0) process.exitCode = 1;
await pool.end();
