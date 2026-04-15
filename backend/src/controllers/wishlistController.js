import pool from '../config/database.js';

export const getWishlist = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.id as wishlist_id, w.user_id, w.product_id, w.created_at,
             p.*, 
             (SELECT name FROM categories c WHERE c.id = p.category_id) as category_name
      FROM wishlists w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ message: 'Failed to to get wishlist' });
  }
};

export const addToWishlist = async (req, res) => {
  const { product_id } = req.body;
  
  if (!product_id) return res.status(400).json({ message: 'Product ID is required' });

  try {
    const result = await pool.query(`
      INSERT INTO wishlists (user_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, product_id) DO NOTHING
      RETURNING *
    `, [req.user.id, product_id]);

    if (result.rows.length === 0) {
      // It was a duplicate and ignored, which is fine.
      return res.status(200).json({ message: 'Already in wishlist' });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ message: 'Failed to add to wishlist' });
  }
};

export const removeFromWishlist = async (req, res) => {
  const { productId } = req.params;

  try {
    await pool.query(
      'DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2',
      [req.user.id, productId]
    );
    res.status(200).json({ message: 'Removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ message: 'Failed to remove from wishlist' });
  }
};