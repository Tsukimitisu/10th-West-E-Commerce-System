import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_ROLES } from '../src/constants/schemaEnums.js';

class BootstrapError extends Error {}

export const readSuperadminCredentials = (env = process.env) => {
  const email = String(env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const name = String(env.SUPERADMIN_NAME || '').trim();
  const password = env.SUPERADMIN_PASSWORD;
  if (!email || !name || !password) throw new BootstrapError('SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD and SUPERADMIN_NAME are required.');
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BootstrapError('SUPERADMIN_EMAIL must be a valid email address.');
  if (name.length > 255) throw new BootstrapError('SUPERADMIN_NAME must be at most 255 characters.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72
    || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password)) {
    throw new BootstrapError('SUPERADMIN_PASSWORD must be at least 12 characters, at most 72 UTF-8 bytes, and include uppercase, lowercase, a number and a symbol.');
  }
  return { email, name, password };
};

export const createSuperadmin = async ({ db, env = process.env, resetPassword = false }) => {
  const { email, name, password } = readSuperadminCredentials(env);
  if (!USER_ROLES.includes('super_admin')) throw new BootstrapError('The existing role constants do not support super_admin.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize simultaneous bootstrap runs for the normalized address.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('superadmin-bootstrap:' || $1))", [email]);
    const findAccount = () => client.query(
      'SELECT id, email, role, is_active, is_deleted, email_verified FROM users WHERE LOWER(email) = $1 FOR UPDATE', [email]
    );
    let existing = await findAccount();
    if (!existing.rowCount) {
      // Same bcrypt library and cost as normal registration; no separate password format.
      const passwordHash = await bcrypt.hash(password, 12);
      const inserted = await client.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, email_verified)
         VALUES ($1, $2, $3, 'super_admin', true, true)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, role, is_active, is_deleted, email_verified`,
        [name, email, passwordHash]
      );
      if (inserted.rowCount) {
        const account = inserted.rows[0];
        // Operator-provisioned accounts are verified, matching the existing bootstrap convention.
        if (account.role !== 'super_admin' || !account.is_active || !account.email_verified || account.is_deleted) {
          throw new BootstrapError('Super Admin account verification failed. No changes made.');
        }
        await client.query('COMMIT');
        return { outcome: 'created', account };
      }
      existing = await findAccount();
    }
    if (existing.rowCount !== 1) throw new BootstrapError('Email is ambiguous or unavailable. No changes made.');
    const account = existing.rows[0];
    if (account.role !== 'super_admin') throw new BootstrapError('Email belongs to another role. No changes made. Use a different email address.');
    if (resetPassword !== true) {
      await client.query('COMMIT');
      return { outcome: 'unchanged', account };
    }
    if (account.is_deleted || !account.is_active || !account.email_verified) {
      throw new BootstrapError('Password reset requires an active, verified Super Admin. Account status was not changed.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `UPDATE users SET password_hash = $2, password_reset_token = NULL, password_reset_expires = NULL,
         failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 AND role = 'super_admin'`, [account.id, passwordHash]
    );
    await client.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [account.id]);
    await client.query('COMMIT');
    return { outcome: 'password_reset', account };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const main = async () => {
  let db;
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--reset-password')) throw new BootstrapError('Supported option: --reset-password');
    // Require explicit process credentials before loading the configured database.
    readSuperadminCredentials();
    console.log('Creating Super Admin in the configured database.');
    ({ default: db } = await import('../src/config/database.js'));
    const result = await createSuperadmin({ db, resetPassword: args.includes('--reset-password') });
    console.log(result.outcome === 'unchanged'
      ? 'Super Admin account already exists. No changes made.'
      : result.outcome === 'created' ? 'Super Admin created. Role: super_admin. Password stored as bcrypt hash.'
        : 'Super Admin password reset. Existing sessions revoked.');
  } catch (error) {
    // Driver errors can contain connection strings or SQL parameters. Never print them.
    console.error(error instanceof BootstrapError ? error.message : 'Super Admin bootstrap failed. Check database configuration and migrations.');
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
