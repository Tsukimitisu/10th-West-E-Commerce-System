import pool from '../src/config/database.js';

const result = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)) AS orders_without_items,
    (SELECT COUNT(*) FROM orders WHERE integrity_status = 'payment_missing') AS payment_missing,
    (SELECT COUNT(*) FROM orders WHERE source = 'pos' AND NULLIF(TRIM(receipt_number), '') IS NULL) AS pos_without_receipt,
    (SELECT COUNT(*) FROM order_items WHERE product_id IS NULL AND NULLIF(TRIM(product_name), '') IS NULL) AS unusable_order_items,
    (SELECT COUNT(*) FROM orders WHERE integrity_status <> 'valid') AS manual_review_orders,
    (SELECT COUNT(*) FROM orders WHERE integrity_status = 'valid') AS valid_orders
`);

console.log(JSON.stringify(result.rows[0], null, 2));
await pool.end();
