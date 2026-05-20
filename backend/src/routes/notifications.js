import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch } from '../services/supabaseRest.js';

const router = express.Router();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      try {
        const notifications = await supabaseRestFetch('notifications', {
          select: '*',
          user_id: `eq.${req.user.id}`,
          order: 'created_at.desc',
          limit: 50,
        });
        return res.json(Array.isArray(notifications) ? notifications : []);
      } catch (fallbackError) {
        console.error('Notifications Supabase REST fallback error:', fallbackError);
        return res.json([]);
      }
    }

    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.json([]);
    }
    res.status(500).json({ message: error.message });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      try {
        const result = await supabaseRestFetch('notifications', {
          select: 'id',
          user_id: `eq.${req.user.id}`,
          is_read: 'eq.false',
        });
        return res.json({ count: Array.isArray(result) ? result.length : 0 });
      } catch (fallbackError) {
        console.error('Notification count Supabase REST fallback error:', fallbackError);
        return res.json({ count: 0 });
      }
    }

    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.json({ count: 0 });
    }
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

// Create notification (internal use)
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), async (req, res) => {
  try {
    const { user_id, type, title, message, reference_id, reference_type, thumbnail_url, metadata } = req.body;
    const result = await pool.query(
      `INSERT INTO notifications (
        user_id, type, title, message, reference_id, reference_type, thumbnail_url, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *`,
      [user_id, type, title, message, reference_id, reference_type, thumbnail_url || null, metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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
