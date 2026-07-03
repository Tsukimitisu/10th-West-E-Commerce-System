import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Public: get active shipping rates
router.get('/rates', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, method, label, base_fee, min_purchase_free, estimated_days, is_active
       FROM shipping_rates
       WHERE is_active = true
       ORDER BY base_fee ASC, id ASC`
    );

    const rates = result.rows.map((row) => ({
      ...row,
      base_fee: row.base_fee === null ? null : parseFloat(row.base_fee),
      min_purchase_free: row.min_purchase_free === null ? null : parseFloat(row.min_purchase_free),
    }));

    res.json(rates);
  } catch (error) {
    console.error('Get shipping rates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
