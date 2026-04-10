import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../services/cloudinary.js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PROFILE_EMAIL_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const PROFILE_PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
const EMAIL_CHANGE_WINDOW_MINUTES = 60;

const normalizeProfilePhone = (value) => String(value || '').trim().replace(/[\s()-]/g, '');
const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });

const isLocalUrl = (hostname) =>
  ['localhost', '127.0.0.1'].includes(hostname) ||
  hostname.startsWith('192.168.') ||
  hostname.startsWith('10.') ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

const getFrontendUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const url = new URL(frontendUrl);

  if (!isLocalUrl(url.hostname)) {
    url.protocol = 'https:';
  }

  return url;
};

const createEmailChangeToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_WINDOW_MINUTES * 60 * 1000),
  };
};

const buildEmailChangeVerificationUrl = (token) => {
  const url = getFrontendUrl();
  url.hash = `/verify-email?emailChangeToken=${encodeURIComponent(token)}`;
  return url.toString();
};

const sendEmailChangeVerificationEmail = async ({ email, currentName, token }) => {
  const transporter = createTransporter();
  const verificationUrl = buildEmailChangeVerificationUrl(token);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
    to: email,
    subject: 'Confirm your new email address - 10th West Moto',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin-top: 0; color: #111827;">Confirm Your New Email Address</h2>
        <p style="color: #374151; line-height: 1.6;">Hi ${currentName || 'there'},</p>
        <p style="color: #374151; line-height: 1.6;">We received a request to change your account email for 10th West Moto.</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 22px; background: #dc2626; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600;">Confirm New Email</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">This link expires in ${EMAIL_CHANGE_WINDOW_MINUTES} minutes.</p>
        <p style="color: #6b7280; font-size: 13px;">If you did not request this change, you can ignore this email.</p>
        <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
      </div>
    `,
  });
};

const ensureUserProfileColumns = async () => {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email_change_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email_change_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;
  `).catch((error) => {
    console.error('Failed to ensure user profile/email-change columns:', error.message || error);
  });

  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email_change_token ON users(email_change_token)').catch(() => {});
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_pending_email ON users(pending_email)').catch(() => {});
};
ensureUserProfileColumns();

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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentUserResult = await client.query(
      `SELECT id, name, email, role, phone, avatar, store_credit, created_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.user.id]
    );

    if (currentUserResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = currentUserResult.rows[0];
    const currentEmail = String(currentUser.email || '').trim().toLowerCase();
    const emailChanged = rawEmail !== currentEmail;

    if (emailChanged) {
      const duplicateResult = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
        [rawEmail, req.user.id]
      );

      if (duplicateResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'That email address is already in use.',
          fieldErrors: {
            email: 'That email address is already in use.',
          },
        });
      }
    }

    let result;
    let emailChangeToken = null;

    if (emailChanged) {
      emailChangeToken = createEmailChangeToken();

      result = await client.query(
        `UPDATE users
         SET name = $1,
             phone = $2,
             avatar = COALESCE($3, avatar),
             pending_email = $4,
             email_change_token = $5,
             email_change_expires = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id, name, email, role, phone, avatar, store_credit, created_at, pending_email`,
        [rawName, normalizedPhone || null, avatar, rawEmail, emailChangeToken.tokenHash, emailChangeToken.expiresAt, req.user.id]
      );
    } else {
      result = await client.query(
        `UPDATE users 
         SET name = $1,
             email = $2,
             phone = $3,
             avatar = COALESCE($4, avatar),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, name, email, role, phone, avatar, store_credit, created_at, pending_email`,
        [rawName, rawEmail, normalizedPhone || null, avatar, req.user.id]
      );
    }

    await client.query('COMMIT');

    const user = result.rows[0];

    if (emailChanged && emailChangeToken) {
      try {
        await sendEmailChangeVerificationEmail({
          email: rawEmail,
          currentName: user.name,
          token: emailChangeToken.token,
        });
      } catch (mailError) {
        await pool.query(
          `UPDATE users
           SET pending_email = NULL,
               email_change_token = NULL,
               email_change_expires = NULL
           WHERE id = $1`,
          [req.user.id]
        ).catch(() => {});

        console.error('Email change verification send error:', mailError);
        return res.status(503).json({
          message: 'Profile saved, but we could not send a verification email for your new address. Please try again shortly.',
          code: 'EMAIL_CHANGE_DELIVERY_FAILED',
        });
      }

      return res.json({
        message: 'Profile updated. Please verify your new email address to complete the email change.',
        requiresEmailVerification: true,
        pending_email: rawEmail,
        user: {
          ...user,
          store_credit: parseFloat(user.store_credit || 0),
        },
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        ...user,
        store_credit: parseFloat(user.store_credit || 0)
      }
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

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
  } finally {
    client.release();
  }
};

export const confirmEmailChange = async (req, res) => {
  const token = String(req.body?.token || '').trim();

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      message: 'Invalid email change token',
      code: 'EMAIL_CHANGE_TOKEN_INVALID',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tokenHash = hashToken(token);
    const userResult = await client.query(
      `SELECT id, name, email, role, phone, avatar, store_credit, created_at,
              pending_email, email_change_expires
       FROM users
       WHERE email_change_token = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Invalid or expired email change link.',
        code: 'EMAIL_CHANGE_TOKEN_INVALID',
      });
    }

    const user = userResult.rows[0];
    const pendingEmail = String(user.pending_email || '').trim().toLowerCase();

    if (!pendingEmail) {
      await client.query(
        `UPDATE users
         SET email_change_token = NULL,
             email_change_expires = NULL
         WHERE id = $1`,
        [user.id]
      );
      await client.query('COMMIT');

      return res.status(400).json({
        message: 'No pending email change was found for this account.',
        code: 'EMAIL_CHANGE_NOT_PENDING',
      });
    }

    const expiresAt = user.email_change_expires ? new Date(user.email_change_expires) : null;
    if (!expiresAt || expiresAt <= new Date()) {
      await client.query(
        `UPDATE users
         SET pending_email = NULL,
             email_change_token = NULL,
             email_change_expires = NULL
         WHERE id = $1`,
        [user.id]
      );
      await client.query('COMMIT');

      return res.status(410).json({
        message: 'This email change link has expired. Please request a new email change from your profile settings.',
        code: 'EMAIL_CHANGE_TOKEN_EXPIRED',
      });
    }

    const duplicateResult = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
      [pendingEmail, user.id]
    );

    if (duplicateResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'That email address is already in use by another account.',
        code: 'EMAIL_CHANGE_CONFLICT',
      });
    }

    const updateResult = await client.query(
      `UPDATE users
       SET email = pending_email,
           pending_email = NULL,
           email_change_token = NULL,
           email_change_expires = NULL,
           email_verified = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, email, role, phone, avatar, store_credit, created_at`,
      [user.id]
    );

    await client.query('COMMIT');

    const updatedUser = updateResult.rows[0];
    return res.json({
      message: 'Your email address has been updated successfully.',
      code: 'EMAIL_CHANGE_CONFIRMED',
      user: {
        ...updatedUser,
        store_credit: parseFloat(updatedUser.store_credit || 0),
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('Confirm email change error:', error);
    return res.status(500).json({
      message: 'Unable to verify email change at this time. Please try again.',
    });
  } finally {
    client.release();
  }
};

export const uploadProfileAvatar = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: 'Avatar storage is not configured. Please contact support.' });
    }

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
    const cloudinaryPublicId = `avatar-${req.user.id}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${ext}`;
    const { url: avatarUrl } = await uploadBufferToCloudinary({
      buffer: req.body,
      contentType,
      folder: `avatars/user-${req.user.id}`,
      publicId: cloudinaryPublicId,
      resourceType: 'image',
    });

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
