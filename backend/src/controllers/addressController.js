import pool from '../config/database.js';

// Get all addresses for a user
export const getUserAddresses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM addresses 
       WHERE user_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single address
export const getAddress = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new address
export const createAddress = async (req, res) => {
  const { recipient_name, phone, street, city, state, postal_code, is_default } = req.body;

  if (!recipient_name || !phone || !street || !city || !state || !postal_code) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If this is set as default, unset all other defaults
    if (is_default) {
      await client.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1',
        [req.user.id]
      );
    }

    // Insert new address
    const result = await client.query(
      `INSERT INTO addresses (user_id, recipient_name, phone, street, city, state, postal_code, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, recipient_name, phone, street, city, state, postal_code, is_default || false]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Address created successfully',
      address: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create address error:', error);
    res.status(500).json({ message: 'Failed to create address' });
  } finally {
    client.release();
  }
};

// Update address
export const updateAddress = async (req, res) => {
  const { id } = req.params;
  const { recipient_name, phone, street, city, state, postal_code, is_default } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if address belongs to user
    const checkResult = await client.query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Address not found' });
    }

    // If this is set as default, unset all other defaults
    if (is_default) {
      await client.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2',
        [req.user.id, id]
      );
    }

    // Update address
    const result = await client.query(
      `UPDATE addresses 
       SET recipient_name = COALESCE($1, recipient_name),
           phone = COALESCE($2, phone),
           street = COALESCE($3, street),
           city = COALESCE($4, city),
           state = COALESCE($5, state),
           postal_code = COALESCE($6, postal_code),
           is_default = COALESCE($7, is_default),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [recipient_name, phone, street, city, state, postal_code, is_default, id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Address updated successfully',
      address: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update address error:', error);
    res.status(500).json({ message: 'Failed to update address' });
  } finally {
    client.release();
  }
};

// Delete address
export const deleteAddress = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ message: 'Failed to delete address' });
  }
};

// Set address as default
export const setDefaultAddress = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if address belongs to user
    const checkResult = await client.query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Address not found' });
    }

    // Unset all defaults
    await client.query(
      'UPDATE addresses SET is_default = false WHERE user_id = $1',
      [req.user.id]
    );

    // Set this as default
    const result = await client.query(
      'UPDATE addresses SET is_default = true WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Default address updated',
      address: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Set default address error:', error);
    res.status(500).json({ message: 'Failed to set default address' });
  } finally {
    client.release();
  }
};
