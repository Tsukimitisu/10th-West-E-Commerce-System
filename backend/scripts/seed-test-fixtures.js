import crypto from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STAFF_PERMISSIONS = Object.freeze([
  'products.view',
  'orders.view',
  'orders.update',
  'inventory.view',
  'inventory.adjust',
  'returns.view',
  'returns.manage',
  'chat.view',
  'chat.reply',
]);

const TEST_ACCOUNTS = Object.freeze([
  { envName: 'CUSTOMER', email: 'customer@test.local', name: 'Test Customer', role: 'customer', phone: '09170000001' },
  { envName: 'CASHIER', email: 'cashier@test.local', name: 'Test Cashier', role: 'cashier', phone: '09170000002' },
  { envName: 'STAFF_NO_PERMS', email: 'staff-noperms@test.local', name: 'Test Staff No Permissions', role: 'store_staff', phone: '09170000003', permissions: [] },
  { envName: 'STAFF', email: 'staff@test.local', name: 'Test Store Staff', role: 'store_staff', phone: '09170000004', permissions: STAFF_PERMISSIONS },
  { envName: 'OWNER', email: 'owner@test.local', name: 'Test Owner', role: 'owner', phone: '09170000005' },
  { envName: 'SUPERADMIN', email: 'superadmin@test.local', name: 'Test Super Admin', role: 'super_admin', phone: '09170000006' },
  { envName: 'DISABLED', email: 'disabled@test.local', name: 'Test Disabled Customer', role: 'customer', phone: '09170000007', active: false },
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
  return password;
};

const writeLocalCredentialMapping = async (password) => {
  const localFile = path.resolve(__dirname, '..', '.test-credentials.local');
  const content = [
    '# Generated local-only test fixture credentials. Do not commit this file.',
    `TEST_FIXTURE_PASSWORD=${JSON.stringify(password)}`,
    ...TEST_ACCOUNTS.map((account) => `E2E_${account.envName}_EMAIL=${JSON.stringify(account.email)}`),
    '',
  ].join('\n');

  await writeFile(localFile, content, { encoding: 'utf8', mode: 0o600 });
  console.log('Updated the ignored local E2E credential mapping.');
};

const upsertAccount = async (client, account, passwordHash) => {
  const result = await client.query(
    `INSERT INTO users (
       name, email, password_hash, role, phone, is_active, email_verified,
       is_deleted, failed_login_attempts, login_attempts, locked_until, updated_at
     )
     VALUES ($1, $2, $3, $4::user_role_enum, $5, $6, true, false, 0, 0, NULL, NOW())
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       phone = EXCLUDED.phone,
       is_active = EXCLUDED.is_active,
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
    [account.name, account.email, passwordHash, account.role, account.phone, account.active !== false]
  );
  return result.rows[0].id;
};

const replacePermissionOverrides = async (client, userId, permissionNames) => {
  const allowedPermissions = [...permissionNames];
  const existing = await client.query(
    'SELECT name FROM permissions WHERE name = ANY($1::text[])',
    [allowedPermissions]
  );
  const existingNames = new Set(existing.rows.map((permission) => permission.name));
  const missingNames = allowedPermissions.filter((permission) => !existingNames.has(permission));

  if (missingNames.length > 0) {
    throw new Error(`Required staff fixture permissions are missing: ${missingNames.join(', ')}`);
  }

  await client.query(
    `INSERT INTO user_permissions (user_id, permission_id, granted)
     SELECT $1, id, name = ANY($2::text[])
     FROM permissions
     ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = EXCLUDED.granted`,
    [userId, allowedPermissions]
  );
};

const seedTestFixtures = async () => {
  assertFixtureEnvironment();
  const password = await getFixturePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const seeded = [];

    for (const account of TEST_ACCOUNTS) {
      const userId = await upsertAccount(client, account, passwordHash);
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

      if (Array.isArray(account.permissions)) {
        await replacePermissionOverrides(client, userId, account.permissions);
      }

      seeded.push({ email: account.email, role: account.role, user_id: userId });
    }

    await client.query('COMMIT');
    transactionOpen = false;
    await writeLocalCredentialMapping(password);
    console.log(JSON.stringify({
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      accounts: seeded,
      password_source: process.env.TEST_FIXTURE_PASSWORD ? 'TEST_FIXTURE_PASSWORD' : 'generated_local_file',
    }, null, 2));
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
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
