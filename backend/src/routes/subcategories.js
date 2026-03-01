import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all subcategories
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT s.*, c.name as category_name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.id ORDER BY c.name, s.name'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get subcategories by category
router.get('/category/:categoryId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subcategories WHERE category_id = $1 ORDER BY name',
      [req.params.categoryId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create subcategory
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { name, category_id } = req.body;
    const result = await pool.query(
      'INSERT INTO subcategories (name, category_id) VALUES ($1, $2) RETURNING *',
      [name, category_id]
    );
    res.status(201).json({ subcategory: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update subcategory
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { name, category_id } = req.body;
    const result = await pool.query(
      'UPDATE subcategories SET name=$1, category_id=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [name, category_id, req.params.id]
    );
    res.json({ subcategory: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete subcategory
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM subcategories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
