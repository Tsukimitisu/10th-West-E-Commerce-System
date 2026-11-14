import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../src/config/database.js';

const SEEDED_EMAILS = [
  'superadmin@10thwest.com',
  'owner@10thwest.com',
  'staff@10thwest.com',
  'customer@10thwest.com',
];

if (String(process.env.CONFIRM_SECURE_SEEDED_ACCOUNTS || '').toLowerCase() !== 'true') {
  console.error('Refusing to change accounts. Set CONFIRM_SECURE_SEEDED_ACCOUNTS=true to continue.');
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let secured = 0;
  for (const email of SEEDED_EMAILS) {
    const randomPassword = `${crypto.randomBytes(32).toString('base64url')}Aa1!`;
    const passwordHash = await bcrypt.hash(randomPassword, 12);
    const result = await client.query(
      `UPDATE users
       SET password_hash = $2, is_active = false, updated_at = NOW()
       WHERE lower(email) = $1
       RETURNING id`,
      [email, passwordHash]
    );
    if (result.rowCount) {
      secured += result.rowCount;
      await client.query(
        'UPDATE sessions SET is_active = false WHERE user_id = ANY($1::int[])',
        [result.rows.map((row) => row.id)]
      );
    }
  }
  await client.query('COMMIT');
  console.log(`Secured ${secured} seeded account(s).`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Unable to secure seeded accounts.');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
