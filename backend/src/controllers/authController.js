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
    { expiresIn: '24h' }
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
     WHERE email = $1 AND success = false AND created_at > NOW() - make_interval(mins => $2)`,
    [email, LOCK_DURATION_MINUTES]
  );
  return parseInt(result.rows[0].cnt) >= MAX_LOGIN_ATTEMPTS;
};

// Ensure OTP table exists (Idempotent)
const initOtpTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registration_otps (
      email VARCHAR(255) PRIMARY KEY,
      otp_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(err => console.error("Error creating OTP table:", err));
};
initOtpTable();

// ─── SEND REGISTRATION OTP ─────────────────────────────────────────
export const sendRegistrationOtp = async (req, res) => {
  const { email, name } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await pool.query(
      `INSERT INTO registration_otps (email, otp_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (email) DO UPDATE SET otp_hash = $2, expires_at = NOW() + INTERVAL '15 minutes'`,
      [email, otpHash]
    );

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
      to: email,
      subject: 'Your Registration Code - 10th West Moto',
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
          .container{max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e293b,#334155);color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0}
          .content{padding:30px;background:#f8fafc}
          .otp{display:inline-block;padding:12px 24px;background:#ea580c;color:white;text-decoration:none;border-radius:8px;font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0}
          .footer{text-align:center;padding:20px;color:#94a3b8;font-size:12px}
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="margin:0">🔐 Verify Your Email</h1><p style="margin:8px 0 0">10th West Moto Parts</p></div>
            <div class="content">
              <h2>Hi ${name || 'there'},</h2>
              <p>Please use the verification code below to complete your registration:</p>
              <div style="text-align:center"><span class="otp">${otp}</span></div>
              <p style="font-size:12px;color:#64748b">This code will expire in 15 minutes. Wait! If you did not request this, you can safely ignore this email.</p>
            </div>
            <div class="footer"><p>10th West Moto - Motorcycle Parts & Accessories</p></div>
          </div>
        </body></html>
      `,
    });

    res.json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

// ─── REGISTER ──────────────────────────────────────────────────────
export const register = async (req, res) => {
  const { name, email, password, consent_given, age_confirmed, newsletter_opt_in } = req.body;
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (existingResult.rows.length > 0) {
      const existingUser = existingResult.rows[0];
      if (existingUser.email_verified) {
        return res.status(400).json({ message: 'Email already registered' });
      } else {
        await pool.query(
          'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
          [verificationTokenHash, expiresAt, existingUser.id]
        );
        const transporter = createTransporter();
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
          to: email,
          subject: 'Verify your account - 10th West Moto',
          html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
        });
        return res.json({ message: 'This email is already registered but not yet verified. A new verification email has been sent.', requiresVerification: true });
      }
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUserResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, email_verified, consent_given, age_confirmed, newsletter_opt_in, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, 'customer', 'active', false, $4, $5, $6, $7, $8) RETURNING id`,
      [name, email, passwordHash, consent_given, age_confirmed, newsletter_opt_in, verificationTokenHash, expiresAt]
    );

    const transporter = createTransporter();
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.', requiresVerification: true });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.status === 'suspended' || user.status === 'banned') return res.status(403).json({ message: `Account ${user.status}` });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.email_verified) return res.status(403).json({ message: 'Your account is not verified. Please verify your email first.', requiresVerification: true, email: user.email });

    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

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
    // Security: token-only URL — no email/PII in URL (RA 10173 §20)
    const resetUrl = `${frontendUrl}/#/reset-password?token=${resetToken}`;

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

// ─── VERIFY RESET TOKEN ────────────────────────────────────────────
export const verifyResetToken = async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) return res.status(400).json({ message: 'Token is required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT id, email, password_reset_expires FROM users WHERE password_reset_token = $1',
      [hashedToken]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid reset token' });
    }

    const user = result.rows[0];
    if (new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }

    // Return masked email for confirmation (no PII leak)
    const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    res.json({ valid: true, email: maskedEmail });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── RESET PASSWORD (token-only, no email in request) ──────────────
export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT id, name, password_hash FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [hashedToken]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Prevent password reuse (RA 10173 §20 — security best practice)
    if (user.password_hash) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
      if (isSamePassword) {
        return res.status(400).json({ message: 'Cannot reuse your current password. Please choose a different one.' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Invalidate all active sessions for security
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [user.id]);
    await logActivity({ userId: user.id, action: 'password_reset_completed', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Password reset successfully. All sessions terminated. You can now login with your new password.' });
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

    // Security: Invalidate all other active sessions (keep current one)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const currentToken = authHeader.split(' ')[1];
      const currentTokenHash = crypto.createHash('sha256').update(currentToken).digest('hex');
      await pool.query(
        'UPDATE sessions SET is_active = false WHERE user_id = $1 AND token_hash != $2',
        [req.user.id, currentTokenHash]
      );
    } else {
      await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [req.user.id]);
    }

    await logActivity({ userId: req.user.id, action: 'password_changed', ipAddress: req.clientIp, userAgent: req.clientUa });

    res.json({ message: 'Password changed successfully. All other sessions have been terminated.' });
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

    // Security: Only return QR code, never expose the raw secret to the frontend
    res.json({ qrCode: qrCodeUrl, message: 'Scan the QR code with your authenticator app, then verify with a code.' });
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

    // Security: Use a short-lived opaque code instead of passing JWT directly in URL.
    // The frontend exchanges this code for a JWT via POST /auth/exchange-code.
    const oauthCode = crypto.randomBytes(32).toString('hex');
    const codeHash = crypto.createHash('sha256').update(oauthCode).digest('hex');
    await pool.query(
      `INSERT INTO oauth_codes (user_id, code_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 minutes')`,
      [user.id, codeHash, ip, ua]
    );

    await logActivity({ userId: user.id, action: 'oauth_login', details: { provider }, ipAddress: ip, userAgent: ua });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // Only pass opaque code in URL — never expose JWT or PII in query params
    res.redirect(`${frontendUrl}/#/oauth-callback?code=${oauthCode}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/login?error=oauth_failed`);
  }
};

// ─── EXCHANGE OAUTH CODE FOR TOKEN ─────────────────────────────────
export const exchangeOAuthCode = async (req, res) => {
  const { code } = req.body;
  const ip = req.clientIp;
  const ua = req.clientUa;

  try {
    if (!code) return res.status(400).json({ message: 'Code is required' });

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const result = await pool.query(
      `SELECT user_id FROM oauth_codes WHERE code_hash = $1 AND expires_at > NOW() AND used = false`,
      [codeHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const userId = result.rows[0].user_id;

    // Mark code as used (single-use)
    await pool.query('UPDATE oauth_codes SET used = true WHERE code_hash = $1', [codeHash]);

    // Fetch user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    const token = signToken(user);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')`,
      [user.id, tokenHash, ip, ua]
    );

    res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    console.error('Exchange OAuth code error:', error);
    res.status(500).json({ message: 'Server error' });
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

// ─── DELETE ACCOUNT (Right to be Forgotten - RA 10173 §18) ─────────
export const deleteAccountHandler = async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;
  const ip = req.clientIp;
  const ua = req.clientUa;

  try {
    // Security: Require password confirmation before account deletion
    const userResult = await pool.query('SELECT password_hash, oauth_provider FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = userResult.rows[0];
    // Password-based accounts must confirm password; OAuth-only accounts skip
    if (user.password_hash && user.password_hash !== 'DELETED') {
      if (!password) return res.status(400).json({ message: 'Password is required to delete your account' });
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) return res.status(401).json({ message: 'Incorrect password' });
    }

    // Anonymize personal data — retain transaction records for BIR compliance
    await pool.query(
      `UPDATE users SET
         name = 'Deleted User',
         email = CONCAT('deleted_', id, '@removed.local'),
         phone = NULL,
         avatar = NULL,
         password_hash = 'DELETED',
         is_active = false,
         two_factor_enabled = false,
         two_factor_secret = NULL,
         deleted_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    // Invalidate all sessions
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [userId]);

    await logActivity({ userId, action: 'account_deleted', entityType: 'user', entityId: userId, ipAddress: ip, userAgent: ua });

    res.json({ message: 'Account deleted and personal data anonymized per RA 10173' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
};

// ─── RESEND EMAIL VERIFICATION ─────────────────────────────────────

export const verifyEmailToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Missing token' });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verification_token = null, email_verification_expires = null WHERE email_verification_token = $1 AND email_verification_expires > NOW() RETURNING id',
      [tokenHash]
    );
    if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid or expired verification link' });
    res.json({ message: 'Your account has been successfully verified. You may now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};


export const exportUserData = async (req, res) => {
  const userId = req.user.id;

  try {
    // Gather all user data
    const userResult = await pool.query(
      `SELECT id, name, email, phone, role, avatar, store_credit, is_active, email_verified, 
              consent_given_at, age_confirmed_at, created_at, last_login, oauth_provider
       FROM users WHERE id = $1`, [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Orders
    const ordersResult = await pool.query(
      `SELECT id, status, total_amount, shipping_address, shipping_method, payment_method, created_at, updated_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]
    );

    // Addresses
    const addressResult = await pool.query(
      `SELECT recipient_name, street, city, state, postal_code, phone, is_default, created_at
       FROM addresses WHERE user_id = $1`, [userId]
    );

    // Activity logs
    const activityResult = await pool.query(
      `SELECT action, details, ip_address, created_at
       FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]
    );

    // Reviews
    let reviewsData = [];
    try {
      const reviewsResult = await pool.query(
        `SELECT product_id, rating, comment, created_at
         FROM reviews WHERE user_id = $1 ORDER BY created_at DESC`, [userId]
      );
      reviewsData = reviewsResult.rows;
    } catch { /* reviews table may not exist */ }

    const exportData = {
      exported_at: new Date().toISOString(),
      legal_basis: 'RA 10173 §18 - Right to Data Portability',
      personal_information: userData,
      orders: ordersResult.rows,
      addresses: addressResult.rows,
      activity_logs: activityResult.rows,
      reviews: reviewsData,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="10thwest-data-export-${userId}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Data export error:', error);
    res.status(500).json({ message: 'Failed to export data' });
  }
};

export const resendVerification = async (req, res) => {
  const { email } = req.body;
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingResult.rows.length === 0) return res.json({ message: 'Verification email sent if account exists.' });
    const user = existingResult.rows[0];
    if (user.email_verified) return res.status(400).json({ message: 'Account is already verified.' });

    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
      [verificationTokenHash, expiresAt, user.id]
    );
    const transporter = createTransporter();
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
      to: email,
      subject: 'Verify your account - 10th West Moto',
      html: `<h2>Verify your email</h2><p>Click <a href="${verificationUrl}">here</a> to verify your account.</p>`
    });
    res.json({ message: 'Verification email resent successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to resend' });
  }
};
