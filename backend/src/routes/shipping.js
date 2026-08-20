import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { calculateDatabaseShippingQuote } from '../services/shipping/internalShipping.js';

const router = express.Router();

router.post('/quote', authenticateToken, requireRole('customer'), async (req, res) => {
  try {
    const quote = await calculateDatabaseShippingQuote(pool, {
      userId: req.user.id,
      addressId: req.body?.address_id,
      items: req.body?.items,
    });
    return res.json(quote);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) console.error('Shipping quote error:', error.message);
    return res.status(status).json({
      ...(error?.code ? { error: error.code } : {}),
      message: status >= 500 ? 'Shipping quote could not be calculated.' : error.message,
    });
  }
});

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
