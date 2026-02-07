import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { logActivity } from '../middleware/activityLogger.js';

// ─── Helpers ───────────────────────────────────────────────────────

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const sanitizeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  phone: row.phone,
  avatar: row.avatar,
  store_credit: parseFloat(row.store_credit || 0),
  is_active: row.is_active,
  two_factor_enabled: row.two_factor_enabled || false,
  oauth_provider: row.oauth_provider || null,
  last_login: row.last_login,
  email_verified: row.email_verified || false,
});

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=]).{8,}$/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

// ─── Record login attempt ──────────────────────────────────────────
const recordLoginAttempt = async (email, ip, success) => {
  await pool.query(
    'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
    [email, ip, success]
  );
};

// ─── Check account lockout ─────────────────────────────────────────
const isAccountLocked = async (email) => {
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM login_attempts
     WHERE email = $1 AND success = false AND created_at > NOW() - INTERVAL '${LOCK_DURATION_MINUTES} minutes'`,
    [email]
  );
  return parseInt(result.rows[0].cnt) >= MAX_LOGIN_ATTEMPTS;
};

// ─── REGISTER ──────────────────────────────────────────────────────
export const register = async (req, res) => {
  const { name, email, password, role = 'customer' } = req.body;
  const ip = req.clientIp;
  const ua = req.clientUa;

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Password strength check
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*()_-+=)',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, email, role, phone, avatar, store_credit, is_active, two_factor_enabled, last_login, email_verified`,
      [name, email, hashedPassword, role]
    );

    const user = result.rows[0];
    const token = signToken(user);

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await logActivity({ userId: user.id, action: 'register', entityType: 'user', entityId: user.id, ipAddress: ip, userAgent: ua });

    res.status(201).json({ message: 'User registered successfully', user: sanitizeUser(user), token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// ─── LOGIN ─────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password, totp_code } = req.body;
  const ip = req.clientIp;
  const ua = req.clientUa;

  try {
    // Check lockout
    if (await isAccountLocked(email)) {
      return res.status(423).json({ message: `Account temporarily locked. Try again in ${LOCK_DURATION_MINUTES} minutes.` });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      await recordLoginAttempt(email, ip, false);
      await logActivity({ userId: null, action: 'login_failed', details: { email, reason: 'not_found' }, ipAddress: ip, userAgent: ua });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account has been deactivated. Contact support.' });
    }

    // OAuth-only accounts cannot login with password
    if (user.oauth_provider && !user.password_hash) {
      return res.status(400).json({ message: `This account uses ${user.oauth_provider} login. Please sign in with ${user.oauth_provider}.` });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await recordLoginAttempt(email, ip, false);
      await pool.query('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1', [user.id]);
      await logActivity({ userId: user.id, action: 'login_failed', details: { reason: 'wrong_password' }, ipAddress: ip, userAgent: ua });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // ── 2FA check ──
    if (user.two_factor_enabled) {
      if (!totp_code) {
        return res.status(200).json({ requires_2fa: true, message: 'Two-factor authentication code required' });
      }
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: totp_code,
        window: 1,
      });
      if (!verified) {
        await logActivity({ userId: user.id, action: '2fa_failed', ipAddress: ip, userAgent: ua });
        return res.status(401).json({ message: 'Invalid 2FA code' });
      }
    }

    // Success
    await recordLoginAttempt(email, ip, true);
    await pool.query('UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user);

    // Create session record
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash, ip, ua]
    );

    await logActivity({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ipAddress: ip, userAgent: ua });

    res.json({ message: 'Login successful', user: sanitizeUser(user), token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// ─── LOGOUT ────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('UPDATE sessions SET is_active = false WHERE token_hash = $1', [tokenHash]);
    }
    await logActivity({ userId: req.user?.id, action: 'logout', ipAddress: req.clientIp, userAgent: req.clientUa });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
};

// ─── GET PROFILE ───────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, phone, avatar, store_credit, is_active,
              two_factor_enabled, oauth_provider, last_login, email_verified, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(sanitizeUser(result.rows[0]));
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── FORGOT PASSWORD ───────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query('SELECT id, name, email, oauth_provider, password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    const user = result.rows[0];
    if (user.oauth_provider && !user.password_hash) {
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [hashedToken, expires, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/#/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '10th West Moto <noreply@10thwest.com>',
      to: email,
      subject: 'Password Reset - 10th West Moto',
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
          .container{max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e293b,#334155);color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0}
          .content{padding:30px;background:#f8fafc}
          .btn{display:inline-block;padding:14px 32px;background:#ea580c;color:white!important;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}
          .footer{text-align:center;padding:20px;color:#94a3b8;font-size:12px}
          .warning{background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px}
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="margin:0">🔐 Password Reset</h1><p style="margin:8px 0 0">10th West Moto Parts</p></div>
            <div class="content">
              <h2>Hi ${user.name},</h2>
              <p>We received a request to reset your password. Click the button below:</p>
              <div style="text-align:center"><a href="${resetUrl}" class="btn">Reset My Password</a></div>
              <div class="warning"><strong>⏰ This link expires in 1 hour.</strong><br>If you didn't request this, ignore this email.</div>
              <p style="font-size:12px;color:#64748b">Or copy this link: ${resetUrl}</p>
            </div>
            <div class="footer"><p>10th West Moto - Motorcycle Parts & Accessories</p></div>
          </div>
        </body></html>
      `,
    });

    await logActivity({ userId: user.id, action: 'password_reset_requested', ipAddress: req.clientIp, userAgent: req.clientUa });
    res.json({ message: 'If that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── RESET PASSWORD ────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  const { token, email, newPassword } = req.body;

  try {
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT id, name FROM users WHERE email = $1 AND password_reset_token = $2 AND password_reset_expires > NOW()',
      [email, hashedToken]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, failed_login_attempts = 0 WHERE id = $2',
      [hashedPassword, user.id]
    );

    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [user.id]);
    await logActivity({ userId: user.id, action: 'password_reset_completed', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── CHANGE PASSWORD (authenticated) ──────────────────────────────
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    if (result.rows[0].password_hash) {
      const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!isValid) return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, req.user.id]);
    await logActivity({ userId: req.user.id, action: 'password_changed', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 2FA: SETUP ───────────────────────────────────────────────────
export const setup2FA = async (req, res) => {
  try {
    const user = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const secret = speakeasy.generateSecret({
      name: `10th West Moto (${user.rows[0].email})`,
      issuer: '10th West Moto',
    });

    await pool.query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret.base32, req.user.id]);
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({ secret: secret.base32, qrCode: qrCodeUrl, message: 'Scan the QR code with your authenticator app, then verify with a code.' });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 2FA: VERIFY (enable) ─────────────────────────────────────────
export const verify2FA = async (req, res) => {
  const { totp_code } = req.body;

  try {
    const result = await pool.query('SELECT two_factor_secret FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const secret = result.rows[0].two_factor_secret;
    if (!secret) return res.status(400).json({ message: 'No 2FA setup in progress' });

    const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token: totp_code, window: 1 });
    if (!verified) return res.status(400).json({ message: 'Invalid code. Try again.' });

    await pool.query('UPDATE users SET two_factor_enabled = true WHERE id = $1', [req.user.id]);
    await logActivity({ userId: req.user.id, action: '2fa_enabled', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Two-factor authentication enabled successfully!' });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 2FA: DISABLE ──────────────────────────────────────────────────
export const disable2FA = async (req, res) => {
  const { password } = req.body;

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    if (result.rows[0].password_hash) {
      const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
      if (!isValid) return res.status(401).json({ message: 'Invalid password' });
    }

    await pool.query('UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1', [req.user.id]);
    await logActivity({ userId: req.user.id, action: '2fa_disabled', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Two-factor authentication disabled' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── OAUTH CALLBACK ────────────────────────────────────────────────
export const oauthCallback = async (req, res) => {
  try {
    const { provider, id: oauthId, email, name, avatar } = req.oauthUser;
    const ip = req.clientIp;
    const ua = req.clientUa;

    let result = await pool.query('SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2', [provider, oauthId]);
    let user;

    if (result.rows.length > 0) {
      user = result.rows[0];
      if (!user.is_active) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/login?error=account_deactivated`);
      }
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    } else {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
        await pool.query(
          'UPDATE users SET oauth_provider = $1, oauth_id = $2, avatar = COALESCE(avatar, $3), email_verified = true, last_login = NOW() WHERE id = $4',
          [provider, oauthId, avatar, user.id]
        );
      } else {
        const newUser = await pool.query(
          `INSERT INTO users (name, email, oauth_provider, oauth_id, avatar, role, email_verified, last_login)
           VALUES ($1, $2, $3, $4, $5, 'customer', true, NOW()) RETURNING *`,
          [name, email, provider, oauthId, avatar]
        );
        user = newUser.rows[0];
      }
    }

    const token = signToken(user);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash, ip, ua]
    );

    await logActivity({ userId: user.id, action: 'oauth_login', details: { provider }, ipAddress: ip, userAgent: ua });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/#/oauth-callback?token=${token}&user=${encodeURIComponent(JSON.stringify(sanitizeUser(user)))}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/login?error=oauth_failed`);
  }
};

// ─── SESSIONS ──────────────────────────────────────────────────────
export const getActiveSessions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, created_at, last_active FROM sessions WHERE user_id = $1 AND is_active = true AND expires_at > NOW() ORDER BY last_active DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const revokeSession = async (req, res) => {
  try {
    await pool.query('UPDATE sessions SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.sessionId, req.user.id]);
    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── ACTIVITY LOGS (admin) ─────────────────────────────────────────
export const getActivityLogs = async (req, res) => {
  const { page = 1, limit = 50, userId, action } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT al.*, u.name as user_name, u.email as user_email FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (userId) { query += ` AND al.user_id = $${idx++}`; params.push(userId); }
    if (action) { query += ` AND al.action = $${idx++}`; params.push(action); }

    query += ` ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM activity_logs WHERE 1=1';
    const cp = [];
    let ci = 1;
    if (userId) { countQuery += ` AND user_id = $${ci++}`; cp.push(userId); }
    if (action) { countQuery += ` AND action = $${ci++}`; cp.push(action); }
    const countResult = await pool.query(countQuery, cp);

    res.json({ logs: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
