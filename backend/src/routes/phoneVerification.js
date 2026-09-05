import express from 'express';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { canonicalPhone, phoneOtpConfig, phoneOtpReadiness, hashPhoneCode, sendSemaphoreCode } from '../services/phoneOtp.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  const readiness = phoneOtpReadiness();
  if (!readiness.available) return res.json({ ...readiness, verified: false });
  try {
    const { rows } = await pool.query(`SELECT u.phone, v.phone AS verified_phone, v.verified_at
      FROM users u LEFT JOIN phone_verifications v ON v.user_id = u.id WHERE u.id = $1`, [req.user.id]);
    const record = rows[0];
    res.json({ ...readiness, verified: Boolean(record?.verified_at && canonicalPhone(record.phone) === record.verified_phone) });
  } catch (error) { next(error); }
});

router.post('/send', async (req, res, next) => {
  if (!phoneOtpReadiness().available) return res.status(503).json({ message: 'Phone verification is unavailable.' });
  const config = phoneOtpConfig();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: users } = await client.query('SELECT phone FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const phone = canonicalPhone(users[0]?.phone);
    if (!phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Save a valid Philippine mobile number in your profile first.' });
    }
    await client.query(`INSERT INTO phone_verifications (user_id, phone) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, phone]);
    const { rows } = await client.query('SELECT * FROM phone_verifications WHERE user_id = $1 FOR UPDATE', [req.user.id]);
    const previous = rows[0];
    const now = Date.now();
    const newWindow = now - new Date(previous.window_started_at).getTime() >= 86400000;
    const tooSoon = previous.last_sent_at && now - new Date(previous.last_sent_at).getTime() < config.cooldown * 1000;
    if (tooSoon || (!newWindow && previous.send_count >= config.daily)) {
      await client.query('ROLLBACK');
      return res.status(429).json({ message: tooSoon ? 'Please wait before requesting another code.' : 'Daily verification limit reached. Try again tomorrow.' });
    }
    const code = String(crypto.randomInt(10 ** (config.length - 1), 10 ** config.length));
    const hash = hashPhoneCode(req.user.id, phone, code);
    await client.query(`UPDATE phone_verifications SET phone=$2, code_hash=$3,
      expires_at=NOW()+($4 * INTERVAL '1 minute'), last_sent_at=NOW(),
      window_started_at=CASE WHEN $5 THEN NOW() ELSE window_started_at END,
      send_count=CASE WHEN $5 THEN 1 ELSE send_count+1 END, attempts=0,
      verified_at=NULL, delivery_accepted=false WHERE user_id=$1`, [req.user.id, phone, hash, config.expiry, newWindow]);
    await client.query('COMMIT');
    // Reserve the quota before the external call: provider failures cannot bypass limits.
    client.release();
    client = null;
    try {
      await sendSemaphoreCode({ phone, code, expiry: config.expiry });
    } catch {
      return res.status(502).json({ message: 'SMS delivery could not be started. Please try again later.' });
    }
    await pool.query('UPDATE phone_verifications SET delivery_accepted=true WHERE user_id=$1 AND code_hash=$2', [req.user.id, hash]);
    return res.json({ message: 'Verification code sent.', expires_in: config.expiry * 60, resend_after: config.cooldown });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client?.release(); }
});

router.post('/verify', async (req, res, next) => {
  if (!phoneOtpReadiness().available) return res.status(503).json({ message: 'Phone verification is unavailable.' });
  const config = phoneOtpConfig();
  const code = String(req.body?.code || '');
  if (!new RegExp(`^\\d{${config.length}}$`).test(code)) return res.status(400).json({ message: 'Enter a valid verification code.' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: users } = await client.query('SELECT phone FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const { rows } = await client.query('SELECT * FROM phone_verifications WHERE user_id=$1 FOR UPDATE', [req.user.id]);
    const record = rows[0];
    if (!record?.code_hash || !record.delivery_accepted || record.attempts >= config.attempts
      || new Date(record.expires_at).getTime() <= Date.now() || canonicalPhone(users[0]?.phone) !== record.phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Code expired or unavailable. Request a new code.' });
    }
    const hash = hashPhoneCode(req.user.id, record.phone, code);
    const valid = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(record.code_hash));
    await client.query(`UPDATE phone_verifications SET attempts=attempts+1,
      verified_at=CASE WHEN $2 THEN NOW() ELSE verified_at END,
      code_hash=CASE WHEN $2 THEN NULL ELSE code_hash END WHERE user_id=$1`, [req.user.id, valid]);
    await client.query('COMMIT');
    return res.status(valid ? 200 : 400).json(valid ? { verified: true, message: 'Phone number verified.' } : { message: 'Incorrect verification code.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client?.release(); }
});

export default router;
