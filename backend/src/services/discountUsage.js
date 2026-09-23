export const releaseDiscountUsage = async (client, { orderId, reason }) => {
  const usageResult = await client.query(
    `SELECT id, discount_id, status
     FROM discount_usages WHERE order_id=$1 FOR UPDATE`,
    [orderId]
  );
  const usage = usageResult.rows[0];
  if (!usage || usage.status === 'released') return false;

  await client.query('SELECT id FROM discounts WHERE id=$1 FOR UPDATE', [usage.discount_id]);
  await client.query(
    `UPDATE discount_usages
     SET status='released',released_at=NOW(),release_reason=$2
     WHERE id=$1 AND status='consumed'`,
    [usage.id, String(reason || 'Order cancelled').slice(0, 255)]
  );
  await client.query(
    `UPDATE discounts SET used_count=GREATEST(0,used_count-1),updated_at=NOW()
     WHERE id=$1`,
    [usage.discount_id]
  );
  return true;
};
