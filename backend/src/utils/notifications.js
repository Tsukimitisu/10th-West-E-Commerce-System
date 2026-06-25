import pool from '../config/database.js';
import { emitNotification } from '../socket.js';

export const ensureNotificationColumns = async () => {
  // Schema is managed exclusively by Knex migrations.
  return;
  await pool.query(`
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS metadata JSONB;
  `).catch((error) => {
    console.error('Failed to ensure notification columns:', error);
  });
};

ensureNotificationColumns();

export const createNotification = async (db, {
  user_id,
  type,
  title,
  message,
  reference_id = null,
  reference_type = null,
  thumbnail_url = null,
  metadata = null,
}) => {
  if (!user_id || !type || !title) return null;

  const result = await db.query(
    `INSERT INTO notifications (
      user_id, type, title, message, reference_id, reference_type, thumbnail_url, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    RETURNING *`,
    [
      user_id,
      type,
      title,
      message || null,
      reference_id,
      reference_type,
      thumbnail_url || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  const notification = result.rows[0] || null;
  if (notification) {
    emitNotification(user_id, notification);
  }

  return notification;
};

export const buildOrderStatusMessage = (status) => {
  switch (status) {
    case 'paid':
      return 'Your order has been confirmed and payment was received.';
    case 'processing':
      return 'Your order is now being processed.';
    case 'packed':
      return 'Your order has been packed.';
    case 'ready_for_pickup':
      return 'Your order is ready for pickup or courier handoff.';
    case 'shipped':
      return 'Your order is on the way.';
    case 'out_for_delivery':
      return 'Your order is out for delivery.';
    case 'delivered':
      return 'Your rider has marked the order as delivered. Please confirm receipt to complete the order.';
    case 'cancelled':
      return 'Your order has been cancelled.';
    default:
      return `Your order status is now ${status}.`;
  }
};
