import pool from '../config/database.js';
import Stripe from 'stripe';
import { emitReturnCreated, emitReturnUpdated, emitStockUpdate } from '../socket.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Create return request
export const createReturn = async (req, res) => {
  const { order_id, items, reason, refund_amount, return_type } = req.body;

  if (!order_id || !items || !reason || refund_amount === undefined) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify order belongs to user
    const orderResult = await client.query(
      'SELECT id, user_id, payment_intent_id FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create return
    const returnResult = await client.query(
      `INSERT INTO returns (order_id, user_id, reason, refund_amount, return_type, items, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [order_id, req.user.id, reason, refund_amount, return_type || 'online', JSON.stringify(items)]
    );

    await client.query('COMMIT');

    const newReturn = {
      ...returnResult.rows[0],
      items: JSON.parse(returnResult.rows[0].items)
    };
    emitReturnCreated(newReturn);

    res.status(201).json({
      message: 'Return request created successfully',
      return: newReturn
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create return error:', error);
    res.status(500).json({ message: 'Failed to create return request' });
  } finally {
    client.release();
  }
};

// Get user's returns
export const getUserReturns = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, o.total_amount as order_total
       FROM returns r
       LEFT JOIN orders o ON r.order_id = o.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    const returns = result.rows.map(r => ({
      ...r,
      items: JSON.parse(r.items),
      refund_amount: parseFloat(r.refund_amount)
    }));

    res.json(returns);
  } catch (error) {
    console.error('Get user returns error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all returns (admin)
export const getAllReturns = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, 
              u.name as customer_name, 
              u.email as customer_email,
              o.total_amount as order_total
       FROM returns r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN orders o ON r.order_id = o.id
       ORDER BY r.created_at DESC`
    );

    const returns = result.rows.map(r => ({
      ...r,
      items: JSON.parse(r.items),
      refund_amount: parseFloat(r.refund_amount)
    }));

    res.json(returns);
  } catch (error) {
    console.error('Get all returns error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single return
export const getReturnById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT r.*, 
              u.name as customer_name, 
              u.email as customer_email,
              o.total_amount as order_total,
              o.payment_intent_id
       FROM returns r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN orders o ON r.order_id = o.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Return not found' });
    }

    const returnData = result.rows[0];

    // Check authorization
    if (req.user.role !== 'admin' && returnData.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      ...returnData,
      items: JSON.parse(returnData.items),
      refund_amount: parseFloat(returnData.refund_amount)
    });
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve return (admin)
export const approveReturn = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE returns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['approved', id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Return not found' });
    }

    await client.query('COMMIT');

    const approvedReturn = {
      ...result.rows[0],
      items: JSON.parse(result.rows[0].items)
    };
    emitReturnUpdated(approvedReturn);

    res.json({
      message: 'Return approved',
      return: approvedReturn
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Approve return error:', error);
    res.status(500).json({ message: 'Failed to approve return' });
  } finally {
    client.release();
  }
};

// Reject return (admin)
export const rejectReturn = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE returns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['rejected', id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Return not found' });
    }

    await client.query('COMMIT');

    const rejectedReturn = {
      ...result.rows[0],
      items: JSON.parse(result.rows[0].items)
    };
    emitReturnUpdated(rejectedReturn);

    res.json({
      message: 'Return rejected',
      return: rejectedReturn
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reject return error:', error);
    res.status(500).json({ message: 'Failed to reject return' });
  } finally {
    client.release();
  }
};

// Process refund (admin)
export const processRefund = async (req, res) => {
  const { id } = req.params;
  const { method } = req.body; // 'original' or 'store_credit'

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get return details
    const returnResult = await client.query(
      `SELECT r.*, o.payment_intent_id, u.email
       FROM returns r
       LEFT JOIN orders o ON r.order_id = o.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (returnResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Return not found' });
    }

    const returnData = returnResult.rows[0];

    if (returnData.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Return must be approved first' });
    }

    let refundReference = null;

    if (method === 'store_credit') {
      // Add store credit
      await client.query(
        `INSERT INTO store_credits (user_id, amount, reason, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, 'return')`,
        [returnData.user_id, returnData.refund_amount, 'Refund for return #' + id, id]
      );

      // Update user's store credit balance
      await client.query(
        'UPDATE users SET store_credit = store_credit + $1 WHERE id = $2',
        [returnData.refund_amount, returnData.user_id]
      );

      refundReference = 'STORE_CREDIT_' + id;
    } else {
      // Process refund via Stripe (if payment_intent_id exists)
      if (returnData.payment_intent_id) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: returnData.payment_intent_id,
            amount: Math.round(parseFloat(returnData.refund_amount) * 100), // Convert to cents
          });
          refundReference = refund.id;
        } catch (stripeError) {
          console.error('Stripe refund error:', stripeError);
          await client.query('ROLLBACK');
          return res.status(500).json({ message: 'Stripe refund failed: ' + stripeError.message });
        }
      } else {
        refundReference = 'MANUAL_REFUND_' + id;
      }
    }

    // Create refund record
    await client.query(
      `INSERT INTO refunds (return_id, payment_reference, amount, method)
       VALUES ($1, $2, $3, $4)`,
      [id, refundReference, returnData.refund_amount, method]
    );

    // Update return status
    await client.query(
      'UPDATE returns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['refunded', id]
    );

    // Restore inventory
    const items = JSON.parse(returnData.items);
    for (const item of items) {
      const stockResult = await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 RETURNING id, name, stock_quantity',
        [item.quantity, item.productId]
      );
      if (stockResult.rows[0]) {
        emitStockUpdate({
          product_id: stockResult.rows[0].id,
          name: stockResult.rows[0].name,
          stock_quantity: parseInt(stockResult.rows[0].stock_quantity)
        });
      }
    }

    await client.query('COMMIT');

    // Emit return status update
    emitReturnUpdated({ ...returnData, status: 'refunded' });

    res.json({
      message: 'Refund processed successfully',
      refund_reference: refundReference,
      method
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Process refund error:', error);
    res.status(500).json({ message: 'Failed to process refund' });
  } finally {
    client.release();
  }
};

// Get user's store credit
export const getUserStoreCredit = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT store_credit FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      balance: parseFloat(result.rows[0].store_credit || 0)
    });
  } catch (error) {
    console.error('Get store credit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get store credit history
export const getStoreCreditHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM store_credits 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(sc => ({
      ...sc,
      amount: parseFloat(sc.amount)
    })));
  } catch (error) {
    console.error('Get store credit history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
