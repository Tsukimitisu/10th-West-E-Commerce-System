import Stripe from 'stripe';
import pool from '../config/database.js';

// Create payment intent
export const createPaymentIntent = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { amount, items } = req.body;

  try {
    // Validate stock availability
    for (const item of items) {
      const product = await pool.query(
        'SELECT stock_quantity FROM products WHERE id = $1',
        [item.product_id]
      );

      if (product.rows.length === 0) {
        return res.status(404).json({ 
          message: `Product ${item.product_id} not found` 
        });
      }

      if (product.rows[0].stock_quantity < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for product ${item.product_id}` 
        });
      }
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: req.user?.id || 'guest',
        item_count: items.length
      }
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ message: 'Failed to create payment intent' });
  }
};

// Verify payment
export const verifyPayment = async (req, res) => {
  const { payment_intent_id } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status === 'succeeded') {
      res.json({ 
        success: true, 
        amount: paymentIntent.amount / 100 
      });
    } else {
      res.json({ 
        success: false, 
        status: paymentIntent.status 
      });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Failed to verify payment' });
  }
};

// Get Stripe publishable key
export const getPublishableKey = async (req, res) => {
  console.log('🔑 Stripe keys loaded:');
  console.log('   SECRET:', process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 20) + '...' : 'NOT SET');
  console.log('   PUBLIC:', process.env.STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 20) + '...' : 'NOT SET');
  
  res.json({ 
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
  });
};
