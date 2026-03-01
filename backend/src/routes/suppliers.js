import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all suppliers
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get supplier by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Supplier not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create supplier
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO suppliers (name, contact_person, email, phone, address, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, contact_person, email, phone, address, notes]
    );
    res.status(201).json({ supplier: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update supplier
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, notes, is_active } = req.body;
    const result = await pool.query(
      'UPDATE suppliers SET name=$1, contact_person=$2, email=$3, phone=$4, address=$5, notes=$6, is_active=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, contact_person, email, phone, address, notes, is_active, req.params.id]
    );
    res.json({ supplier: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete supplier
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
