import Stripe from 'stripe';
import pool from '../config/database.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const SUPPORTED_CURRENCIES = new Set(['php', 'usd']);

const toFiniteNumber = (value, fallback = NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.round(toFiniteNumber(value, 0) * 100) / 100;

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      product_id: Number(item?.product_id),
      quantity: Number(item?.quantity),
    }))
    .filter((item) => Number.isInteger(item.product_id) && item.product_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
};

// Create payment intent
export const createPaymentIntent = async (req, res) => {
  const { amount, items, currency = 'php' } = req.body;

  try {
    const normalizedCurrency = String(currency || 'php').trim().toLowerCase();
    if (!SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
      return res.status(400).json({ message: 'Unsupported currency' });
    }

    const normalizedItems = normalizeItems(items);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: 'At least one valid checkout item is required.' });
    }

    const productIds = [...new Set(normalizedItems.map((item) => item.product_id))];
    const productResult = await pool.query(
      `SELECT id, name, price, stock_quantity
       FROM products
       WHERE id = ANY($1::int[])`,
      [productIds]
    );

    const productMap = new Map(productResult.rows.map((row) => [Number(row.id), row]));
    let minimumAmount = 0;

    for (const item of normalizedItems) {
      const product = productMap.get(item.product_id);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.product_id} not found` });
      }

      if (Number(product.stock_quantity) < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name || `product ${item.product_id}`}`,
        });
      }

      minimumAmount += roundMoney(toFiniteNumber(product.price, 0) * item.quantity);
    }

    const requestedAmount = roundMoney(toFiniteNumber(amount, NaN));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    if (requestedAmount < roundMoney(minimumAmount)) {
      return res.status(400).json({
        message: 'Requested amount is below the current cart subtotal. Please refresh checkout totals and try again.',
      });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(requestedAmount * 100),
      currency: normalizedCurrency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: req.user?.id || 'guest',
        item_count: normalizedItems.length,
        min_subtotal: String(roundMoney(minimumAmount)),
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
    if (!payment_intent_id || typeof payment_intent_id !== 'string') {
      return res.status(400).json({ message: 'Payment intent ID is required' });
    }

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
