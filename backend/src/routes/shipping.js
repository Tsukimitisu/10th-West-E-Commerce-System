import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

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

// Admin/staff: update tracking and shipping info for an order
router.put(
  '/tracking/:orderId',
  authenticateToken,
  requireRole('admin', 'super_admin', 'owner', 'store_staff'),
  async (req, res) => {
    const { orderId } = req.params;
    const { tracking_number, shipping_method, status, estimated_delivery, delivery_notes } = req.body || {};

    const updates = [];
    const params = [];
    let index = 1;

    if (tracking_number !== undefined) {
      updates.push(`tracking_number = $${index++}`);
      params.push(tracking_number || null);
    }

    if (shipping_method !== undefined) {
      updates.push(`shipping_method = $${index++}`);
      params.push(shipping_method || null);
    }

    if (status !== undefined) {
      updates.push(`status = $${index++}`);
      params.push(status || null);
    }

    if (estimated_delivery !== undefined) {
      updates.push(`estimated_delivery = $${index++}`);
      params.push(estimated_delivery || null);
    }

    if (delivery_notes !== undefined) {
      updates.push(`delivery_notes = $${index++}`);
      params.push(delivery_notes || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(orderId);

    try {
      const result = await pool.query(
        `UPDATE orders
         SET ${updates.join(', ')}
         WHERE id = $${index}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({
        message: 'Tracking updated successfully',
        order: result.rows[0],
      });
    } catch (error) {
      console.error('Update tracking error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

export default router;

