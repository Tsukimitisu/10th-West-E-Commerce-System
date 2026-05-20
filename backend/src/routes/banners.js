import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch } from '../services/supabaseRest.js';

const router = express.Router();

// Get active banners (public)
router.get('/', async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      const banners = await supabaseRestFetch('banners', {
        select: '*',
        is_active: 'eq.true',
        order: 'display_order.asc',
      });
      return res.json(Array.isArray(banners) ? banners : []);
    }

    const result = await pool.query(
      'SELECT * FROM banners WHERE is_active = true ORDER BY display_order ASC'
    );
    res.json(result.rows);
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.json([]);
    }
    res.status(500).json({ message: error.message });
  }
});

// Get all banners (admin)
router.get('/all', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM banners ORDER BY display_order ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create banner
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { title, subtitle, button_text, image_url, link_url, is_active, display_order } = req.body;
    const result = await pool.query(
      'INSERT INTO banners (title, subtitle, button_text, image_url, link_url, is_active, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, subtitle, button_text, image_url, link_url, is_active ?? true, display_order ?? 0]
    );
    res.status(201).json({ banner: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update banner
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { title, subtitle, button_text, image_url, link_url, is_active, display_order } = req.body;
    const result = await pool.query(
      'UPDATE banners SET title=$1, subtitle=$2, button_text=$3, image_url=$4, link_url=$5, is_active=$6, display_order=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [title, subtitle, button_text, image_url, link_url, is_active, display_order, req.params.id]
    );
    res.json({ banner: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete banner
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM banners WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
