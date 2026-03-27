import crypto from 'crypto';
import pool from '../config/database.js';

const saveSession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

const regenerateSession = (req) =>
  new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });

const generateGuestCartSessionId = () =>
  crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');

export const ensureGuestCartSessionId = async (req) => {
  if (!req.session) {
    throw new Error('Session is required for guest carts');
  }

  if (!req.session.cartSessionId) {
    req.session.cartSessionId = generateGuestCartSessionId();
    await saveSession(req);
  }

  return req.session.cartSessionId;
};

export const rotateGuestSession = async (req) => {
  if (!req.session) return null;

  await regenerateSession(req);
  req.session.cartSessionId = generateGuestCartSessionId();
  await saveSession(req);

  return req.session.cartSessionId;
};

const getCartByUserId = async (client, userId) => {
  const result = await client.query(
    `SELECT *
     FROM carts
     WHERE user_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

const getCartBySessionId = async (client, sessionId) => {
  const result = await client.query(
    `SELECT *
     FROM carts
     WHERE session_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] || null;
};

const createCart = async (client, ownership) => {
  const columns = [];
  const values = [];
  const params = [];

  if (ownership.userId) {
    columns.push('user_id');
    params.push(ownership.userId);
    values.push(`$${params.length}`);
  }

  if (ownership.sessionId) {
    columns.push('session_id');
    params.push(ownership.sessionId);
    values.push(`$${params.length}`);
  }

  const result = await client.query(
    `INSERT INTO carts (${columns.join(', ')})
     VALUES (${values.join(', ')})
     RETURNING *`,
    params
  );

  return result.rows[0];
};

const touchCart = async (client, cartId) => {
  await client.query(
    'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [cartId]
  );
};

export const getOrCreateCart = async (req, client = pool) => {
  const userId = req.user?.id || null;

  if (userId) {
    let cart = await getCartByUserId(client, userId);
    if (!cart) {
      cart = await createCart(client, { userId });
    }
    return cart;
  }

  const guestSessionId = await ensureGuestCartSessionId(req);
  let cart = await getCartBySessionId(client, guestSessionId);
  if (!cart) {
    cart = await createCart(client, { sessionId: guestSessionId });
  }
  return cart;
};

export const mergeGuestCartIntoUserCart = async (guestSessionId, userId) => {
  if (!guestSessionId || !userId) return;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const guestCart = await getCartBySessionId(client, guestSessionId);
    if (!guestCart) {
      await client.query('COMMIT');
      return;
    }

    let userCart = await getCartByUserId(client, userId);
    if (!userCart) {
      userCart = await createCart(client, { userId });
    }

    const guestItemsResult = await client.query(
      `SELECT product_id, quantity
       FROM cart_items
       WHERE cart_id = $1
       ORDER BY id ASC`,
      [guestCart.id]
    );

    for (const guestItem of guestItemsResult.rows) {
      const existingItemResult = await client.query(
        `SELECT id, quantity
         FROM cart_items
         WHERE cart_id = $1 AND product_id = $2
         LIMIT 1`,
        [userCart.id, guestItem.product_id]
      );

      if (existingItemResult.rows.length > 0) {
        await client.query(
          `UPDATE cart_items
           SET quantity = quantity + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [guestItem.quantity, existingItemResult.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity)
           VALUES ($1, $2, $3)`,
          [userCart.id, guestItem.product_id, guestItem.quantity]
        );
      }
    }

    await touchCart(client, userCart.id);
    await client.query('DELETE FROM carts WHERE id = $1', [guestCart.id]);

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

// Get cart for current owner
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
      items: items.rows.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        product: {
          id: item.product_id,
          name: item.name,
          price: parseFloat(item.price),
          image: item.image,
          stock_quantity: item.stock_quantity,
        },
      })),
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

    const existing = await pool.query(
      'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cart.id, product_id]
    );

    if (existing.rows.length > 0) {
      const newQuantity = existing.rows[0].quantity + quantity;

      if (product.rows[0].stock_quantity < newQuantity) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }

      await pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQuantity, existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)',
        [cart.id, product_id, quantity]
      );
    }

    await touchCart(pool, cart.id);
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

    await touchCart(pool, cart.id);
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

    await touchCart(pool, cart.id);
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
    await touchCart(pool, cart.id);

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
