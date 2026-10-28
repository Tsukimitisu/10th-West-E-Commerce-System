import crypto from 'node:crypto';
import pool from '../config/database.js';
import { canonicalPhone, phoneOtpConfig, hashPhoneCode, sendPhoneVerificationCode } from './phoneOtp.js';

export const PHONE_RECOVERY_MESSAGE = 'If an eligible account matches that phone number, a verification code will be sent.';
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const codeHash = (userId, phone, id, code) => hashPhoneCode(userId, `password-reset:${id}:${phone}`, code);

// Transport/config injection keeps tests isolated from real SMS and databases.
export const createPasswordRecovery = ({ db = pool, send = sendPhoneVerificationCode, config = phoneOtpConfig } = {}) => {
  const eligibleUser = async (client, phone) => {
    const { rows } = await client.query(`SELECT u.id, u.phone FROM users u
      JOIN phone_verifications v ON v.user_id = u.id
      WHERE v.phone = $1 AND v.verified_at IS NOT NULL AND u.is_active = true
        AND COALESCE(u.is_deleted, false) = false AND u.password_hash IS NOT NULL AND u.password_hash <> ''
      ORDER BY u.id LIMIT 2 FOR UPDATE OF u`, [phone]);
    // A shared verified number is ambiguous: never guess which account to reset.
    return rows.length === 1 && canonicalPhone(rows[0].phone) === phone ? rows[0] : null;
  };

  const request = async value => {
    const id = crypto.randomUUID();
    const response = { message: PHONE_RECOVERY_MESSAGE, challenge_id: id, expires_in: 300, resend_after: 60 };
    const phone = canonicalPhone(value);
    let client;
    try {
      const limits = config();
      response.resend_after = limits.cooldown;
      if (!phone || !limits.available) return response;
      client = await db.connect();
      await client.query('BEGIN');
      const user = await eligibleUser(client, phone);
      if (!user) { await client.query('ROLLBACK'); return response; }
      const { rows } = await client.query(`SELECT *,
        created_at > NOW() - ($2 * INTERVAL '1 second') AS cooling_down,
        window_started_at <= NOW() - INTERVAL '24 hours' AS new_window
        FROM password_reset_sms_challenges WHERE user_id = $1 FOR UPDATE`, [user.id, limits.cooldown]);
      const old = rows[0];
      if (old?.cooling_down || (old && !old.new_window && old.send_count >= limits.daily)) {
        await client.query('ROLLBACK'); return response;
      }
      const code = String(crypto.randomInt(100000, 1000000));
      await client.query(`INSERT INTO password_reset_sms_challenges
        (user_id, id, code_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')
        ON CONFLICT (user_id) DO UPDATE SET id = EXCLUDED.id, code_hash = EXCLUDED.code_hash,
          expires_at = EXCLUDED.expires_at, attempts = 0, consumed_at = NULL, created_at = NOW(), delivery_accepted = false,
          window_started_at = CASE WHEN $4 THEN NOW() ELSE password_reset_sms_challenges.window_started_at END,
          send_count = CASE WHEN $4 THEN 1 ELSE password_reset_sms_challenges.send_count + 1 END`,
      [user.id, id, codeHash(user.id, phone, id, code), Boolean(old?.new_window)]);
      await client.query('COMMIT');
      client.release(); client = null;
      // Quota is reserved before delivery; failure/timeout cannot bypass cooldown.
      // Do not expose eligible-account lookup through provider network latency.
      // Acceptance is recorded asynchronously; no code can verify before it.
      void (async () => {
        try {
          await send({ phone, code, expiry: 5, purpose: 'password-reset' });
          await db.query('UPDATE password_reset_sms_challenges SET delivery_accepted = true WHERE id = $1 AND consumed_at IS NULL', [id]);
        } catch {
          console.warn('PASSWORD_RESET_SMS_DELIVERY_FAILED', { request_id: id });
        }
      })();
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.warn('PASSWORD_RESET_SMS_REQUEST_FAILED', { request_id: id });
    } finally { client?.release(); }
    return response;
  };

  const verify = async ({ phone: value, challenge_id: id, code }) => {
    const phone = canonicalPhone(value);
    if (!phone || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '')) || !/^\d{6}$/.test(String(code || ''))) return null;
    let client;
    try {
      const limits = config();
      if (!limits.available) return null;
      client = await db.connect();
      await client.query('BEGIN');
      const user = await eligibleUser(client, phone);
      const record = user && (await client.query(`SELECT *, expires_at > NOW() AS unexpired
        FROM password_reset_sms_challenges WHERE user_id = $1 AND id = $2 FOR UPDATE`, [user.id, id])).rows[0];
      if (!record || record.consumed_at || !record.unexpired || !record.delivery_accepted || record.attempts >= limits.attempts) {
        await client.query('ROLLBACK'); return null;
      }
      const expected = codeHash(user.id, phone, id, String(code));
      const valid = record.code_hash.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(record.code_hash));
      await client.query(`UPDATE password_reset_sms_challenges SET attempts = attempts + 1,
        consumed_at = CASE WHEN $2 OR attempts + 1 >= $3 THEN NOW() ELSE NULL END WHERE user_id = $1`,
      [user.id, valid, limits.attempts]);
      let grant = null;
      if (valid) {
        grant = crypto.randomBytes(32).toString('hex');
        await client.query(`UPDATE users SET password_reset_token = $1,
          password_reset_expires = NOW() + INTERVAL '10 minutes' WHERE id = $2`, [tokenHash(grant), user.id]);
      }
      await client.query('COMMIT');
      return grant;
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.warn('PASSWORD_RESET_SMS_VERIFY_FAILED');
      return null;
    } finally { client?.release(); }
  };
  return { request, verify };
};

const recovery = createPasswordRecovery();
export const forgotPasswordPhone = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(await recovery.request(req.body?.phone));
};
export const verifyPasswordResetPhone = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = await recovery.verify(req.body || {});
  return token ? res.json({ reset_token: token }) : res.status(400).json({ message: 'Invalid or expired code. Request a new code if needed.' });
};
