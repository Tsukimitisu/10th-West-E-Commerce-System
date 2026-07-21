import crypto from 'crypto';
import pool from '../config/database.js';
import { isDatabaseConnectivityError } from '../services/supabaseRest.js';

const MAX_ITEM_QUANTITY = 99;

const toPositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

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

const acquireCartOwnershipLock = async (client, ownership) => {
  const lockKey = ownership.userId
    ? `cart:user:${ownership.userId}`
    : `cart:session:${ownership.sessionId}`;

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
};

const resolveCartOwnership = async (req) => {
  const userId = req.user?.id || null;
  if (userId) {
    return { userId, sessionId: null };
  }

  const guestSessionId = await ensureGuestCartSessionId(req);
  return { userId: null, sessionId: guestSessionId };
};

const withCartTransaction = async (req, callback) => {
  const ownership = await resolveCartOwnership(req);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await acquireCartOwnershipLock(client, ownership);

    const cart = await getOrCreateCartByOwnership(client, ownership);
    const result = await callback(client, cart, ownership);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

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

  try {
    const result = await client.query(
      `INSERT INTO carts (${columns.join(', ')})
       VALUES (${values.join(', ')})
       RETURNING *`,
      params
    );

    return result.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      if (ownership.userId) {
        return getCartByUserId(client, ownership.userId);
      }
      if (ownership.sessionId) {
        return getCartBySessionId(client, ownership.sessionId);
      }
    }

    throw error;
  }
};

const touchCart = async (client, cartId) => {
  await client.query(
    'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [cartId]
  );
};

export const getOrCreateCart = async (req, client = pool) => {
  const ownership = await resolveCartOwnership(req);
  return getOrCreateCartByOwnership(client, ownership);
};

const getOrCreateCartByOwnership = async (client, ownership) => {
  const userId = ownership.userId || null;
  const sessionId = ownership.sessionId || null;

  if (userId) {
    let cart = await getCartByUserId(client, userId);
    if (!cart) {
      cart = await createCart(client, { userId });
    }
    return cart;
  }

  let cart = await getCartBySessionId(client, sessionId);
  if (!cart) {
    cart = await createCart(client, { sessionId });
  }
  return cart;
};

export const mergeGuestCartIntoUserCart = async (guestSessionId, userId) => {
  if (!guestSessionId || !userId) return;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await acquireCartOwnershipLock(client, { userId, sessionId: null });
    await acquireCartOwnershipLock(client, { userId: null, sessionId: guestSessionId });

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
      `SELECT product_id, variant_id, SUM(quantity)::int AS quantity
       FROM cart_items
       WHERE cart_id = $1
       GROUP BY product_id, variant_id
       ORDER BY product_id, variant_id NULLS FIRST`,
      [guestCart.id]
    );

    for (const guestItem of guestItemsResult.rows) {
      const existingItemResult = await client.query(
        `SELECT id, quantity
         FROM cart_items
         WHERE cart_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3
         FOR UPDATE
         LIMIT 1`,
        [userCart.id, guestItem.product_id, guestItem.variant_id]
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
          `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [userCart.id, guestItem.product_id, guestItem.variant_id, guestItem.quantity]
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
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.variant_id, ci.quantity,
              p.name, p.price, p.sale_price, p.is_on_sale, p.image, p.status,
              pv.variant_type, pv.variant_value, pv.sku AS variant_sku, pv.image_url AS variant_image,
              COALESCE(pv.price, CASE WHEN pv.id IS NOT NULL THEN p.price + pv.price_adjustment ELSE p.price END) AS effective_price,
              COALESCE(pv.stock_quantity - pv.reserved_stock, p.stock_quantity - p.reserved_stock) AS available_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON pv.id = ci.variant_id AND pv.product_id = ci.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.id ASC`,
      [cart.id]
    );

    res.json({
      cart_id: cart.id,
      items: items.rows.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        available_stock: Number(item.available_stock),
        is_available: item.status === 'active' && Number(item.available_stock) >= Number(item.quantity),
        warning: item.status !== 'active' ? 'Product is unavailable' : (Number(item.available_stock) < Number(item.quantity) ? 'Quantity exceeds available stock' : null),
        product: {
          id: item.product_id,
          name: item.name,
          price: parseFloat(item.effective_price),
          image: item.variant_image || item.image,
          stock_quantity: Number(item.available_stock),
        },
        variant: item.variant_id ? { id: item.variant_id, type: item.variant_type, value: item.variant_value, sku: item.variant_sku } : null,
      })),
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Cart is temporarily unavailable.' });
  }
};

// Add item to cart
export const addToCart = async (req, res) => {
  const productId = toPositiveInt(req.body?.product_id);
  const rawVariantId = req.body?.variant_id ?? req.body?.variantId;
  const variantId = rawVariantId === undefined || rawVariantId === null || rawVariantId === '' ? null : toPositiveInt(rawVariantId);
  const quantity = toPositiveInt(req.body?.quantity ?? 1);

  if (!productId) {
    return res.status(400).json({ message: 'Valid product_id is required' });
  }

  if (!quantity || quantity > MAX_ITEM_QUANTITY) {
    return res.status(400).json({
      message: `Quantity must be between 1 and ${MAX_ITEM_QUANTITY}`,
    });
  }

  try {
    await withCartTransaction(req, async (client, cart) => {
      const productResult = await client.query(
        `SELECT id, stock_quantity, reserved_stock,
                EXISTS (SELECT 1 FROM product_variants WHERE product_id = products.id) AS has_variants
         FROM products
         WHERE id = $1 AND status = 'active' AND COALESCE(is_deleted, false) = false
         FOR UPDATE`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        const notFoundError = new Error('Product not found');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const product = productResult.rows[0];
      if (product.has_variants && !variantId) {
        const variantError = new Error('A product variant is required');
        variantError.statusCode = 400;
        throw variantError;
      }
      let availableStock = Number(product.stock_quantity) - Number(product.reserved_stock || 0);
      if (variantId) {
        const variantResult = await client.query(
          `SELECT stock_quantity, reserved_stock FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE`,
          [variantId, productId]
        );
        if (!variantResult.rowCount) {
          const variantError = new Error('Selected variant is invalid');
          variantError.statusCode = 400;
          throw variantError;
        }
        availableStock = Number(variantResult.rows[0].stock_quantity) - Number(variantResult.rows[0].reserved_stock || 0);
      }
      if (availableStock < quantity) {
        const stockError = new Error('Insufficient stock');
        stockError.statusCode = 400;
        throw stockError;
      }

      const existingResult = await client.query(
        `SELECT id, quantity
         FROM cart_items
         WHERE cart_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3
         FOR UPDATE
         LIMIT 1`,
        [cart.id, productId, variantId]
      );

      if (existingResult.rows.length > 0) {
        const existingItem = existingResult.rows[0];
        const nextQuantity = Number(existingItem.quantity) + quantity;

        if (nextQuantity > availableStock) {
          const stockError = new Error('Insufficient stock');
          stockError.statusCode = 400;
          throw stockError;
        }

        if (nextQuantity > MAX_ITEM_QUANTITY) {
          const qtyError = new Error(`Quantity must be between 1 and ${MAX_ITEM_QUANTITY}`);
          qtyError.statusCode = 400;
          throw qtyError;
        }

        await client.query(
          `UPDATE cart_items
           SET quantity = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextQuantity, existingItem.id]
        );
      } else {
        await client.query(
          'INSERT INTO cart_items (cart_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)',
          [cart.id, productId, variantId, quantity]
        );
      }

      await touchCart(client, cart.id);
    });

    res.json({ message: 'Item added to cart successfully' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Add to cart error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Cart is temporarily unavailable.' });
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
  const itemId = toPositiveInt(req.params?.id);
  const quantity = toPositiveInt(req.body?.quantity);

  if (!itemId) {
    return res.status(400).json({ message: 'Valid cart item id is required' });
  }

  if (!quantity || quantity > MAX_ITEM_QUANTITY) {
    return res.status(400).json({
      message: `Quantity must be between 1 and ${MAX_ITEM_QUANTITY}`,
    });
  }

  try {
    await withCartTransaction(req, async (client, cart) => {
      const itemResult = await client.query(
        `SELECT ci.id, ci.product_id, ci.variant_id,
                COALESCE(pv.stock_quantity - pv.reserved_stock, p.stock_quantity - p.reserved_stock) AS available_stock
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         LEFT JOIN product_variants pv ON pv.id = ci.variant_id
         WHERE ci.id = $1 AND ci.cart_id = $2
         FOR UPDATE OF ci, p`,
        [itemId, cart.id]
      );

      if (itemResult.rows.length === 0) {
        const notFoundError = new Error('Cart item not found');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const item = itemResult.rows[0];
      if (Number(item.available_stock) < quantity) {
        const stockError = new Error('Insufficient stock');
        stockError.statusCode = 400;
        throw stockError;
      }

      await client.query(
        `UPDATE cart_items
         SET quantity = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [quantity, itemId]
      );

      await touchCart(client, cart.id);
    });

    res.json({ message: 'Cart updated successfully' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Update cart error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Cart is temporarily unavailable.' });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  const itemId = toPositiveInt(req.params?.id);

  if (!itemId) {
    return res.status(400).json({ message: 'Valid cart item id is required' });
  }

  try {
    await withCartTransaction(req, async (client, cart) => {
      const result = await client.query(
        'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id',
        [itemId, cart.id]
      );

      if (result.rows.length === 0) {
        const notFoundError = new Error('Cart item not found');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      await touchCart(client, cart.id);
    });

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Remove from cart error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Cart is temporarily unavailable.' });
  }
};

// Clear cart
export const clearCart = async (req, res) => {
  try {
    await withCartTransaction(req, async (client, cart) => {
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
      await touchCart(client, cart.id);
    });

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Cart is temporarily unavailable.' });
  }
};
