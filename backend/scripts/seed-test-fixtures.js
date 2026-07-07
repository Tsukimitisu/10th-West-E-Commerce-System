import crypto from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_ACCOUNTS = Object.freeze([
  { key: 'customer', email: 'customer@test.local', name: 'Test Customer', role: 'customer', phone: '09170000001' },
  { key: 'cashier', email: 'cashier@test.local', name: 'Test Cashier', role: 'cashier', phone: '09170000002' },
  { key: 'staffNoPerms', email: 'staff-noperms@test.local', name: 'Test Staff No Permissions', role: 'store_staff', phone: '09170000003', denyAllPermissions: true },
  { key: 'staff', email: 'staff@test.local', name: 'Test Store Staff', role: 'store_staff', phone: '09170000004' },
  { key: 'owner', email: 'owner@test.local', name: 'Test Owner', role: 'owner', phone: '09170000005' },
  { key: 'superadmin', email: 'superadmin@test.local', name: 'Test Super Admin', role: 'super_admin', phone: '09170000006' },
]);

const normalizeBoolean = (value) => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());

const assertFixtureEnvironment = () => {
  const environment = String(process.env.NODE_ENV || 'development').toLowerCase();
  if (environment === 'production') {
    throw new Error('Test fixture accounts are disabled in production.');
  }
  if (!['development', 'test'].includes(environment) && !normalizeBoolean(process.env.ENABLE_TEST_FIXTURES)) {
    throw new Error('Set ENABLE_TEST_FIXTURES=true outside development/test to seed test fixture accounts.');
  }
  if (!normalizeBoolean(process.env.ENABLE_TEST_FIXTURES)) {
    throw new Error('Set ENABLE_TEST_FIXTURES=true to seed test fixture accounts.');
  }
};

const createGeneratedPassword = () => {
  const random = crypto.randomBytes(18).toString('base64url');
  return `Test-${random}aA1!`;
};

const getFixturePassword = async () => {
  const configured = String(process.env.TEST_FIXTURE_PASSWORD || '').trim();
  const password = configured || createGeneratedPassword();
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password)) {
    throw new Error('TEST_FIXTURE_PASSWORD must be at least 12 characters and include uppercase, lowercase, number, and symbol.');
  }

  if (!configured) {
    const localFile = path.resolve(__dirname, '..', '.test-credentials.local');
    const content = [
      '# Generated local-only test fixture credentials. Do not commit this file.',
      `TEST_FIXTURE_PASSWORD=${password}`,
      ...TEST_ACCOUNTS.map((account) => `E2E_${account.key.toUpperCase()}_EMAIL=${account.email}`),
      '',
    ].join('\n');
    await writeFile(localFile, content, { encoding: 'utf8' });
    console.log(`Generated TEST_FIXTURE_PASSWORD and wrote ${localFile}`);
  }

  return password;
};

const upsertAccount = async (client, account, passwordHash) => {
  const result = await client.query(
    `INSERT INTO users (
       name, email, password_hash, role, phone, is_active, email_verified,
       is_deleted, failed_login_attempts, login_attempts, locked_until, updated_at
     )
     VALUES ($1, $2, $3, $4::user_role_enum, $5, true, true, false, 0, 0, NULL, NOW())
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       phone = EXCLUDED.phone,
       is_active = true,
       email_verified = true,
       is_deleted = false,
       failed_login_attempts = 0,
       login_attempts = 0,
       locked_until = NULL,
       two_factor_enabled = false,
       two_factor_secret = NULL,
       two_factor_recovery_hashes = '[]'::jsonb,
       updated_at = NOW()
     RETURNING id`,
    [account.name, account.email, passwordHash, account.role, account.phone]
  );
  return result.rows[0].id;
};

const seedTestFixtures = async () => {
  assertFixtureEnvironment();
  const password = await getFixturePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const seeded = [];

    for (const account of TEST_ACCOUNTS) {
      const userId = await upsertAccount(client, account, passwordHash);
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

      if (account.denyAllPermissions) {
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, granted)
           SELECT $1, id, false FROM permissions
           ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = false`,
          [userId]
        );
      }

      seeded.push({ email: account.email, role: account.role, user_id: userId });
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      accounts: seeded,
      password_source: process.env.TEST_FIXTURE_PASSWORD ? 'TEST_FIXTURE_PASSWORD' : 'generated_local_file',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedTestFixtures().catch((error) => {
  console.error(`Unable to seed test fixture accounts: ${error.message}`);
  process.exitCode = 1;
});
