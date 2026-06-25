import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark all as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/deliveries', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('notifications.manage'), async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await pool.query(
      `SELECT nd.*, n.type, n.title, n.reference_id, n.reference_type
       FROM notification_deliveries nd LEFT JOIN notifications n ON n.id = nd.notification_id
       ORDER BY nd.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/deliveries/:id/retry', authenticateToken, requireRole('admin', 'super_admin', 'owner'), requirePermission('notifications.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notification_deliveries SET status='queued', next_attempt_at=NOW(), last_error=NULL, updated_at=NOW()
       WHERE id=$1 AND status='failed' RETURNING *`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Failed delivery not found.' });
    return res.json(result.rows[0]);
  } catch (error) { return res.status(500).json({ message: 'Delivery could not be queued.' }); }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
