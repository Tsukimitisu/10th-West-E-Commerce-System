import pool from '../config/database.js';

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const normalizePhone = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  return text.replace(/[\s()-]/g, '');
};

const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const ZIP_REGEX = /^\d{4}$/;

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
  const recipient_name = normalizeText(req.body.recipient_name ?? req.body.name);
  const phone = normalizePhone(req.body.phone);
  const street = normalizeText(req.body.street);
  const barangay = normalizeText(req.body.barangay);
  const city = normalizeText(req.body.city);
  const state = normalizeText(req.body.state);
  const postal_code = normalizeText(req.body.postal_code ?? req.body.zip);
  const is_default = !!req.body.is_default;
  const lat = req.body.lat ?? null;
  const lng = req.body.lng ?? null;

  let accountName = null;
  let accountPhone = null;
  if (!recipient_name || !phone) {
    try {
      const profileResult = await pool.query(
        'SELECT name, phone FROM users WHERE id = $1 LIMIT 1',
        [req.user.id],
      );
      if (profileResult.rows.length > 0) {
        accountName = normalizeText(profileResult.rows[0].name);
        accountPhone = normalizePhone(profileResult.rows[0].phone);
      }
    } catch (error) {
      console.error('Address create fallback profile lookup error:', error);
    }
  }

  const resolvedRecipientName = recipient_name || accountName;
  const resolvedPhone = phone || accountPhone;

  const fieldErrors = {};
  if (!resolvedRecipientName) fieldErrors.recipient_name = 'Recipient name is required.';
  if (!resolvedPhone) fieldErrors.phone = 'Phone is required.';
  else if (!PHONE_REGEX.test(resolvedPhone)) fieldErrors.phone = 'Phone must start with 09 or +639 and contain 11 digits.';
  if (!street) fieldErrors.street = 'Street is required.';
  if (!city) fieldErrors.city = 'City is required.';
  if (!state) fieldErrors.state = 'Province is required.';
  if (!postal_code) fieldErrors.postal_code = 'ZIP code is required.';
  else if (!ZIP_REGEX.test(postal_code)) fieldErrors.postal_code = 'ZIP code must contain exactly 4 digits.';

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({ message: 'Please correct the highlighted address fields.', fieldErrors });
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
      `INSERT INTO addresses (user_id, recipient_name, phone, street, barangay, city, state, postal_code, address_string, lat, lng, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.user.id, resolvedRecipientName, resolvedPhone, street, barangay, city, state, postal_code, `${street}, ${barangay ? `${barangay}, ` : ''}${city}, ${state} ${postal_code}, Philippines`, lat, lng, is_default]
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
  const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body || {}, field);

  const incomingRecipientName = normalizeText(req.body.recipient_name ?? req.body.name);
  const incomingPhone = normalizePhone(req.body.phone);
  const incomingStreet = normalizeText(req.body.street);
  const incomingBarangay = hasField('barangay') ? normalizeText(req.body.barangay) : undefined;
  const incomingCity = normalizeText(req.body.city);
  const incomingState = normalizeText(req.body.state);
  const incomingPostalCode = normalizeText(req.body.postal_code ?? req.body.zip);
  const incomingIsDefault = typeof req.body.is_default === 'boolean' ? req.body.is_default : null;
  const nextLat = hasField('lat') ? (req.body.lat ?? null) : undefined;
  const nextLng = hasField('lng') ? (req.body.lng ?? null) : undefined;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if address belongs to user
    const checkResult = await client.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Address not found' });
    }

    const existingAddress = checkResult.rows[0];

    const profileResult = await client.query(
      'SELECT name, phone FROM users WHERE id = $1 LIMIT 1',
      [req.user.id],
    );
    const accountProfile = profileResult.rows[0] || {};

    const recipient_name = incomingRecipientName
      || normalizeText(existingAddress.recipient_name)
      || normalizeText(accountProfile.name);
    const phone = incomingPhone
      || normalizePhone(existingAddress.phone)
      || normalizePhone(accountProfile.phone);
    const street = incomingStreet || normalizeText(existingAddress.street);
    const barangay = incomingBarangay === undefined
      ? normalizeText(existingAddress.barangay)
      : incomingBarangay;
    const city = incomingCity || normalizeText(existingAddress.city);
    const state = incomingState || normalizeText(existingAddress.state);
    const postal_code = incomingPostalCode || normalizeText(existingAddress.postal_code);
    const is_default = incomingIsDefault === null ? Boolean(existingAddress.is_default) : incomingIsDefault;
    const lat = nextLat === undefined ? existingAddress.lat : nextLat;
    const lng = nextLng === undefined ? existingAddress.lng : nextLng;

    const fieldErrors = {};
    if (!recipient_name) fieldErrors.recipient_name = 'Recipient name is required.';
    if (!phone) fieldErrors.phone = 'Phone is required.';
    else if (!PHONE_REGEX.test(phone)) fieldErrors.phone = 'Phone must start with 09 or +639 and contain 11 digits.';
    if (!street) fieldErrors.street = 'Street is required.';
    if (!city) fieldErrors.city = 'City is required.';
    if (!state) fieldErrors.state = 'Province is required.';
    if (!postal_code) fieldErrors.postal_code = 'ZIP code is required.';
    else if (!ZIP_REGEX.test(postal_code)) fieldErrors.postal_code = 'ZIP code must contain exactly 4 digits.';

    if (Object.keys(fieldErrors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Please correct the highlighted address fields.', fieldErrors });
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
       SET recipient_name = $1,
           phone = $2,
           street = $3,
         barangay = $4,
         city = $5,
         state = $6,
         postal_code = $7,
         address_string = $8,
         lat = $9,
         lng = $10,
         is_default = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
       [recipient_name, phone, street, barangay, city, state, postal_code, `${street}, ${barangay ? `${barangay}, ` : ''}${city}, ${state} ${postal_code}, Philippines`, lat, lng, is_default, id]
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
