// Persist owned cart-line identity before leaving for hosted checkout. Product
// IDs alone cannot distinguish a removed/re-added item or a Buy Now purchase.
export const snapshotCheckoutCart = async (client, { userId, items, source }) => {
  if (source !== 'cart') return { source, lines: [] };
  const result = await client.query(`SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity
    FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1 FOR UPDATE OF ci`, [userId]);
  const lines = items.flatMap(item => {
    const line = result.rows.find(row => Number(row.product_id) === Number(item.product_id)
      && Number(row.variant_id || 0) === Number(item.variant_id || 0));
    return line ? [{ id: line.id, product_id: line.product_id, variant_id: line.variant_id,
      quantity: Math.min(Number(line.quantity), Number(item.quantity)) }] : [];
  });
  return { source, lines };
};

export const clearPaidCheckoutCart = async (client, orderId) => {
  const result = await client.query('SELECT user_id, payment_method, payment_status, payment_metadata FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  const order = result.rows[0];
  const snapshot = order?.payment_metadata?.cart_checkout;
  if (order?.payment_method !== 'gcash' || order.payment_status !== 'paid'
    || snapshot?.source !== 'cart' || snapshot.completed_at || !Array.isArray(snapshot.lines)) return;
  for (const line of snapshot.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) continue;
    const owned = await client.query(`SELECT ci.id, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
      WHERE ci.id = $1 AND c.user_id = $2 AND ci.product_id = $3
      AND ci.variant_id IS NOT DISTINCT FROM $4 FOR UPDATE OF ci`, [line.id, order.user_id, line.product_id, line.variant_id ?? null]);
    if (!owned.rowCount) continue;
    if (Number(owned.rows[0].quantity) > line.quantity) {
      await client.query('UPDATE cart_items SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1', [line.id, line.quantity]);
    } else await client.query('DELETE FROM cart_items WHERE id = $1', [line.id]);
  }
  await client.query(`UPDATE orders SET payment_metadata = jsonb_set(payment_metadata,
    '{cart_checkout,completed_at}', to_jsonb(NOW())) WHERE id = $1`, [orderId]);
  await client.query('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [order.user_id]);
};
