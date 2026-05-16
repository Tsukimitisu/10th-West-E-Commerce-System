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
      `SELECT id, name, price, stock_quantity, product_type, status
       FROM products
       WHERE id = ANY($1::int[])`,
      [productIds]
    );

    const productMap = new Map(productResult.rows.map((row) => [Number(row.id), row]));
    const bundleComponentsResult = await pool.query(
      `SELECT bc.bundle_product_id, bc.component_product_id, bc.quantity, p.name, p.stock_quantity
       FROM product_bundle_components bc
       JOIN products p ON p.id = bc.component_product_id
       WHERE bc.bundle_product_id = ANY($1::int[])`,
      [productIds]
    );
    const componentsByBundle = new Map();
    for (const row of bundleComponentsResult.rows) {
      const bundleId = Number(row.bundle_product_id);
      if (!componentsByBundle.has(bundleId)) componentsByBundle.set(bundleId, []);
      componentsByBundle.get(bundleId).push({
        component_product_id: Number(row.component_product_id),
        quantity: Number(row.quantity),
        name: row.name,
        stock_quantity: Number(row.stock_quantity),
      });
    }
    const stockNeeded = new Map();
    let minimumAmount = 0;

    for (const item of normalizedItems) {
      const product = productMap.get(item.product_id);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.product_id} not found` });
      }

      if (String(product.status || '').toLowerCase() !== 'active') {
        return res.status(400).json({
          message: `${product.name || `Product ${item.product_id}`} is not currently purchasable`,
        });
      }

      if (String(product.product_type || 'single') === 'bundle') {
        const components = componentsByBundle.get(item.product_id) || [];
        if (components.length === 0) {
          return res.status(400).json({ message: `${product.name} has no configured bundle components` });
        }
        for (const component of components) {
          const nextRequired = (stockNeeded.get(component.component_product_id) || 0) + (component.quantity * item.quantity);
          if (Number(component.stock_quantity) < nextRequired) {
            return res.status(400).json({ message: `Insufficient stock for ${component.name}` });
          }
          stockNeeded.set(component.component_product_id, nextRequired);
        }
      } else {
        const nextRequired = (stockNeeded.get(item.product_id) || 0) + item.quantity;
        if (Number(product.stock_quantity) < nextRequired) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.name || `product ${item.product_id}`}`,
          });
        }
        stockNeeded.set(item.product_id, nextRequired);
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
