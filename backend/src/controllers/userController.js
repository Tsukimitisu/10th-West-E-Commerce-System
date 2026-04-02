import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import supabaseClient from '../services/supabaseClient.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_BUCKET = 'avatars';
const PROFILE_EMAIL_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const PROFILE_PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

const normalizeProfilePhone = (value) => String(value || '').trim().replace(/[\s()-]/g, '');

const hasSupabaseStorageConfig = () => {
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  );
};

const ensureAvatarBucketIsPublic = async () => {
  if (!hasSupabaseStorageConfig()) return;

  const { data: bucket, error: getBucketError } = await supabaseClient.storage.getBucket(AVATAR_BUCKET);
  if (getBucketError) {
    const { error: createBucketError } = await supabaseClient.storage.createBucket(AVATAR_BUCKET, {
      public: true,
      fileSizeLimit: `${MAX_AVATAR_BYTES}`,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
    });

    if (createBucketError && !String(createBucketError.message || '').toLowerCase().includes('already exists')) {
      throw createBucketError;
    }
    return;
  }

  if (bucket && bucket.public === false) {
    const { error: updateBucketError } = await supabaseClient.storage.updateBucket(AVATAR_BUCKET, {
      public: true,
      fileSizeLimit: `${MAX_AVATAR_BYTES}`,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
    });

    if (updateBucketError) {
      throw updateBucketError;
    }
  }
};

const persistAvatarToLocal = async (req, filename, fileBuffer) => {
  await fs.mkdir(avatarUploadsDir, { recursive: true });
  const filepath = path.join(avatarUploadsDir, filename);
  await fs.writeFile(filepath, fileBuffer);
  return `${req.protocol}://${req.get('host')}/uploads/avatars/${filename}`;
};

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
  const normalizedPhone = normalizeProfilePhone(rawPhone);
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
  } else if (!PROFILE_EMAIL_REGEX.test(rawEmail)) {
    fieldErrors.email = 'Enter a valid email address.';
  }

  if (rawPhone) {
    if (normalizedPhone.length > 13) {
      fieldErrors.phone = 'Phone number must not exceed 13 characters.';
    } else if (!PROFILE_PHONE_REGEX.test(normalizedPhone)) {
      fieldErrors.phone = 'Enter a valid phone number (09XXXXXXXXX or +639XXXXXXXXX).';
    }
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
      [rawName, rawEmail, normalizedPhone || null, avatar, req.user.id]
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

export const uploadProfileAvatar = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ message: 'Unsupported file type. Use JPG, PNG, or WEBP.' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Image file is required.' });
    }

    if (req.body.length > MAX_AVATAR_BYTES) {
      return res.status(400).json({ message: 'Image must be 2 MB or smaller.' });
    }

    const ext = MIME_EXTENSION_MAP[contentType] || 'bin';
    const filename = `avatar-${req.user.id}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    let avatarUrl = null;

    if (process.env.SUPABASE_URL && hasSupabaseStorageConfig()) {
      let canUseSupabaseStorage = true;
      try {
        await ensureAvatarBucketIsPublic();
      } catch (bucketError) {
        canUseSupabaseStorage = false;
        console.warn('Failed to ensure avatars bucket visibility, falling back to local FS:', bucketError.message || bucketError);
      }

      if (canUseSupabaseStorage) {
        const objectPath = `user-${req.user.id}/${filename}`;
        const { error } = await supabaseClient.storage
          .from(AVATAR_BUCKET)
          .upload(objectPath, req.body, {
            contentType,
            upsert: false,
          });

        if (!error) {
          const { data: publicUrlData } = supabaseClient.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(objectPath);

          const publicUrl = publicUrlData?.publicUrl || '';
          if (publicUrl) {
            try {
              const headResponse = await fetch(publicUrl, { method: 'HEAD' });
              if (headResponse.ok) {
                avatarUrl = publicUrl;
              } else {
                console.warn(`Supabase avatar URL is not publicly reachable (status ${headResponse.status}), falling back to local FS.`);
              }
            } catch (publicCheckError) {
              console.warn('Unable to verify Supabase avatar URL reachability, falling back to local FS:', publicCheckError.message || publicCheckError);
            }
          }
        } else {
          console.warn('Supabase avatar upload failed, falling back to local FS:', error.message);
        }
      }
    }

    if (!avatarUrl) {
      avatarUrl = await persistAvatarToLocal(req, filename, req.body);
    }

    const updatedResult = await pool.query(
      `UPDATE users
       SET avatar = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, role, phone, avatar, store_credit, created_at`,
      [avatarUrl, req.user.id],
    );

    const updatedUser = updatedResult.rows[0] || null;

    res.status(201).json({
      message: 'Profile picture uploaded successfully.',
      avatarUrl,
      user: updatedUser ? {
        ...updatedUser,
        store_credit: parseFloat(updatedUser.store_credit || 0),
      } : null,
    });
  } catch (error) {
    console.error('Upload profile avatar error:', error);
    res.status(500).json({ message: 'Failed to upload profile picture.' });
  }
};

// Change password
export const changePassword = async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string'
    ? req.body.currentPassword
    : req.body.oldPassword;
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.' });
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
    const isValid = await bcrypt.compare(currentPassword, currentPasswordHash);

    if (!isValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, currentPasswordHash);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from your current password.' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

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
