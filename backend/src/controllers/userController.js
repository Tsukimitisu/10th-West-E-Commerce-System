import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

// Get user profile
export const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, avatar, store_credit, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      ...user,
      store_credit: parseFloat(user.store_credit || 0)
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  const rawName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const rawEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const rawPhone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const avatar = req.body.avatar ?? null;

  const fieldErrors = {};

  if (!rawName) {
    fieldErrors.name = 'Name is required.';
  } else if (rawName.length < 2) {
    fieldErrors.name = 'Name must be at least 2 characters.';
  } else if (rawName.length > 100) {
    fieldErrors.name = 'Name must be 100 characters or fewer.';
  }

  if (!rawEmail) {
    fieldErrors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    fieldErrors.email = 'Enter a valid email address.';
  }

  if (rawPhone && !/^[0-9+\-\s()]{7,20}$/.test(rawPhone)) {
    fieldErrors.phone = 'Enter a valid phone number.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      message: 'Please correct the highlighted fields.',
      fieldErrors,
    });
  }

  try {
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
      [rawEmail, req.user.id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: 'That email address is already in use.',
        fieldErrors: {
          email: 'That email address is already in use.',
        },
      });
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = $1,
           email = $2,
           phone = $3,
           avatar = COALESCE($4, avatar),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, email, role, phone, avatar, store_credit, created_at`,
      [rawName, rawEmail, rawPhone || null, avatar, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        ...user,
        store_credit: parseFloat(user.store_credit || 0)
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'That email address is already in use.',
        fieldErrors: {
          email: 'That email address is already in use.',
        },
      });
    }
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// Change password
export const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }

  try {
    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentPasswordHash = user.password_hash;

    if (!currentPasswordHash) {
      return res.status(400).json({ message: 'This account does not have a password to change. Please use account recovery or set a password from your login provider settings.' });
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, currentPasswordHash);

    if (!isValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, currentPasswordHash);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from your current password.' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
};
