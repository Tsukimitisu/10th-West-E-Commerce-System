import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get variants for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY variant_type, variant_value',
      [req.params.productId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add variant
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { product_id, variant_type, variant_value, price_adjustment, stock_quantity, sku } = req.body;
    const result = await pool.query(
      'INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, stock_quantity, sku) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [product_id, variant_type, variant_value, price_adjustment || 0, stock_quantity || 0, sku]
    );
    res.status(201).json({ variant: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update variant
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const { variant_type, variant_value, price_adjustment, stock_quantity, sku } = req.body;
    const result = await pool.query(
      'UPDATE product_variants SET variant_type=$1, variant_value=$2, price_adjustment=$3, stock_quantity=$4, sku=$5 WHERE id=$6 RETURNING *',
      [variant_type, variant_value, price_adjustment, stock_quantity, sku, req.params.id]
    );
    res.json({ variant: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete variant
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
