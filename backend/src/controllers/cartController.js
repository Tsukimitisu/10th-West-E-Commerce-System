import pool from '../config/database.js';

// Get or create cart for user or session
const getOrCreateCart = async (req) => {
  const userId = req.user?.id || null;
  const sessionId = !userId ? req.session.id : null;

  if (userId) {
    let cart = await pool.query('SELECT * FROM carts WHERE user_id = $1', [userId]);
    if (cart.rows.length === 0) {
      cart = await pool.query(
        'INSERT INTO carts (user_id) VALUES ($1) RETURNING *',
        [userId]
      );
    }
    return cart.rows[0];
  } else {
    let cart = await pool.query('SELECT * FROM carts WHERE session_id = $1', [sessionId]);
    if (cart.rows.length === 0) {
      cart = await pool.query(
        'INSERT INTO carts (session_id) VALUES ($1) RETURNING *',
        [sessionId]
      );
    }
    return cart.rows[0];
  }
};

// Merge guest cart to user cart on login (if needed, but for now we fix leakage)
export const getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req);

    const items = await pool.query(
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity,
              p.name, p.price, p.image, p.stock_quantity
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1
       ORDER BY ci.id ASC`,
      [cart.id]
    );

    res.json({
      cart_id: cart.id,
      items: items.rows.map(item => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        product: {
          id: item.product_id,
          name: item.name,
          price: parseFloat(item.price),
          image: item.image,
          stock_quantity: item.stock_quantity
        }
      }))
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add item to cart
export const addToCart = async (req, res) => {
  const { product_id, quantity = 1 } = req.body;

  try {
    const cart = await getOrCreateCart(req);

    // Check if product exists and has stock
    const product = await pool.query(
      'SELECT id, stock_quantity FROM products WHERE id = $1',
      [product_id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.rows[0].stock_quantity < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    // Check if item already in cart
    const existing = await pool.query(
      'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cart.id, product_id]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      const newQuantity = existing.rows[0].quantity + quantity;
      
      if (product.rows[0].stock_quantity < newQuantity) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }

      await pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQuantity, existing.rows[0].id]
      );
    } else {
      // Add new item
      await pool.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)',
        [cart.id, product_id, quantity]
      );
    }

    res.json({ message: 'Item added to cart successfully' });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  try {
    const cart = await getOrCreateCart(req);

    // Verify item belongs to user's cart
    const item = await pool.query(
      `SELECT ci.*, p.stock_quantity 
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [id, cart.id]
    );

    if (item.rows.length === 0) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (item.rows[0].stock_quantity < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    await pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, id]
    );

    res.json({ message: 'Cart updated successfully' });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  const { id } = req.params;

  try {
    const cart = await getOrCreateCart(req);

    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id',
      [id, cart.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Clear cart
export const clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req);

    await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
