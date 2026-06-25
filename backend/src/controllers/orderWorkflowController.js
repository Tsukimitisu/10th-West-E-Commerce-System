import pool from '../config/database.js';
import { emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';

const TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  payment_pending: ['paid', 'failed', 'cancelled'],
  paid: ['processing', 'refund_processing'],
  processing: ['packed', 'cancelled', 'refund_processing'],
  packed: ['ready_for_pickup', 'cancelled', 'refund_processing'],
  ready_for_pickup: ['shipped', 'cancelled', 'refund_processing'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['return_requested'],
  return_requested: ['return_approved', 'return_rejected'],
  return_approved: ['returned'],
  returned: ['refund_processing'],
  refund_processing: ['refunded', 'partially_refunded'],
};

const commitCodReservations = async (client, orderId, actorId) => {
  const reservations = await client.query(
    `SELECT * FROM stock_reservations WHERE order_id = $1 AND status = 'active' FOR UPDATE`,
    [orderId]
  );
  if (!reservations.rowCount) {
    const error = new Error('Order has no active stock reservation.');
    error.status = 409;
    throw error;
  }
  const updates = [];
  for (const row of reservations.rows) {
    const stock = row.variant_id
      ? await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity - $1, reserved_stock = reserved_stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity >= $1 AND reserved_stock >= $1
         RETURNING stock_quantity + $1 AS stock_before, stock_quantity AS stock_after`,
        [row.quantity, row.variant_id]
      )
      : await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1, reserved_stock = reserved_stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock_quantity >= $1 AND reserved_stock >= $1
         RETURNING stock_quantity + $1 AS stock_before, stock_quantity AS stock_after`,
        [row.quantity, row.product_id]
      );
    if (!stock.rowCount) {
      const error = new Error('Reserved inventory could not be committed.');
      error.status = 409;
      throw error;
    }
    await client.query(
      `INSERT INTO stock_movements (product_id, variant_id, order_id, quantity_delta, stock_before, stock_after, reason, reference_type, reference_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'sale','order',$3,$7)`,
      [row.product_id, row.variant_id, orderId, -Number(row.quantity), stock.rows[0].stock_before, stock.rows[0].stock_after, actorId]
    );
    updates.push({ product_id: row.product_id, variant_id: row.variant_id, stock_quantity: Number(stock.rows[0].stock_after) });
  }
  await client.query(`UPDATE stock_reservations SET status = 'committed', committed_at = NOW() WHERE order_id = $1 AND status = 'active'`, [orderId]);
  return updates;
};

const releaseReservations = async (client, orderId) => {
  const rows = await client.query(`SELECT * FROM stock_reservations WHERE order_id = $1 AND status = 'active' FOR UPDATE`, [orderId]);
  for (const row of rows.rows) {
    if (row.variant_id) {
      await client.query(`UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW() WHERE id = $2`, [row.quantity, row.variant_id]);
    } else {
      await client.query(`UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW() WHERE id = $2`, [row.quantity, row.product_id]);
    }
  }
  await client.query(`UPDATE stock_reservations SET status = 'released', released_at = NOW() WHERE order_id = $1 AND status = 'active'`, [orderId]);
};

export const getOrderTimeline = async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    const owner = await pool.query(`SELECT id FROM orders WHERE id = $1 AND ($2::boolean OR user_id = $3)`, [orderId, staff, req.user.id]);
    if (!owner.rowCount) return res.status(404).json({ message: 'Order not found.' });
    const result = await pool.query(
      `SELECT id, from_status, to_status, source, note, metadata, created_at
       FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`,
      [orderId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Get order timeline failed:', error);
    return res.status(500).json({ message: 'Order timeline could not be loaded.' });
  }
};

export const updateOrderStatusSecure = async (req, res) => {
  const orderId = Number(req.params.id);
  const nextStatus = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
  const client = await pool.connect();
  let stockUpdates = [];
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = result.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (!(TRANSITIONS[order.status] || []).includes(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Transition from ${order.status} to ${nextStatus} is not allowed.` });
    }
    if (order.payment_method === 'gcash' && nextStatus === 'processing' && order.payment_status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Online payment must be verified before processing.' });
    }
    if (order.payment_method === 'cod' && order.status === 'pending' && nextStatus === 'processing') {
      stockUpdates = await commitCodReservations(client, orderId, req.user.id);
    }
    await client.query(`UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`, [orderId, nextStatus]);
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, source, changed_by, note) VALUES ($1,$2,$3,'staff',$4,$5)`,
      [orderId, order.status, nextStatus, req.user.id, note]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1,'order.status.update','order',$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [req.user.id, String(orderId), req.ip, req.get('user-agent'), JSON.stringify({ status: order.status }), JSON.stringify({ status: nextStatus })]
    );
    await client.query('COMMIT');
    stockUpdates.forEach(emitStockUpdate);
    emitOrderStatusUpdate(orderId, nextStatus);
    return res.json({ order_id: orderId, status: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Secure order status update failed:', error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Order status could not be updated.' });
  } finally { client.release(); }
};

export const cancelOrderSecure = async (req, res) => {
  const orderId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!reason) return res.status(400).json({ message: 'Cancellation reason is required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = result.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    const staff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user.role);
    if (!staff && Number(order.user_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (!['pending', 'payment_pending', 'paid', 'processing', 'packed', 'ready_for_pickup'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order can no longer be cancelled.' });
    }
    const shipment = await client.query(`SELECT id, status FROM shipments WHERE order_id = $1 FOR UPDATE`, [orderId]);
    if (shipment.rows[0] && !['pending', 'failed', 'cancelled'].includes(shipment.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'The courier booking must be cancelled before this order.' });
    }
    if (shipment.rows[0]) await client.query(`UPDATE shipments SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`, [shipment.rows[0].id]);

    const isCaptured = order.payment_status === 'paid';
    if (!isCaptured) {
      await releaseReservations(client, orderId);
      await client.query(`UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE order_id = $1 AND status <> 'paid'`, [orderId]);
    }
    const nextStatus = isCaptured ? 'refund_processing' : 'cancelled';
    await client.query(
      `UPDATE orders SET status = $2, payment_status = CASE WHEN $3 THEN 'processing' ELSE 'cancelled' END,
       cancelled_at = NOW(), cancellation_reason = $4, updated_at = NOW() WHERE id = $1`,
      [orderId, nextStatus, isCaptured, reason]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, source, changed_by, note) VALUES ($1,$2,$3,'cancellation',$4,$5)`,
      [orderId, order.status, nextStatus, req.user.id, reason]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1,'order.cancel','order',$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [req.user.id, String(orderId), req.ip, req.get('user-agent'), JSON.stringify({ status: order.status }), JSON.stringify({ status: nextStatus, reason })]
    );
    await client.query('COMMIT');
    emitOrderStatusUpdate(orderId, nextStatus);
    return res.json({ order_id: orderId, status: nextStatus, refund_required: isCaptured });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Secure cancellation failed:', error);
    return res.status(500).json({ message: 'Order could not be cancelled.' });
  } finally { client.release(); }
};
