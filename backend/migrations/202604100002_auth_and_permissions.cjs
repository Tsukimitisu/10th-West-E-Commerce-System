const DEFAULT_PERMISSIONS = [
  { name: 'products.view', description: 'View products', category: 'Products' },
  { name: 'products.create', description: 'Create products', category: 'Products' },
  { name: 'products.edit', description: 'Edit products', category: 'Products' },
  { name: 'products.delete', description: 'Delete products', category: 'Products' },
  { name: 'orders.view', description: 'View orders', category: 'Orders' },
  { name: 'orders.edit', description: 'Edit order status', category: 'Orders' },
  { name: 'orders.refund', description: 'Process refunds', category: 'Orders' },
  { name: 'customers.view', description: 'View customers', category: 'Customers' },
  { name: 'customers.edit', description: 'Edit customers', category: 'Customers' },
  { name: 'reports.view', description: 'View reports', category: 'Reports' },
  { name: 'staff.view', description: 'View staff', category: 'Staff' },
  { name: 'staff.manage', description: 'Manage staff', category: 'Staff' },
  { name: 'settings.manage', description: 'Manage settings', category: 'Settings' },
  { name: 'pos.access', description: 'Access POS terminal', category: 'POS' },
  { name: 'returns.view', description: 'View returns', category: 'Returns' },
  { name: 'returns.process', description: 'Process returns', category: 'Returns' },
  { name: 'inventory.view', description: 'View inventory', category: 'Inventory' },
  { name: 'inventory.manage', description: 'Manage inventory', category: 'Inventory' },
];

const CASHIER_PERMISSIONS = [
  'products.view',
  'orders.view',
  'orders.edit',
  'pos.access',
  'returns.view',
  'customers.view',
  'inventory.view',
];

const STORE_STAFF_PERMISSIONS = [
  'products.view',
  'orders.view',
  'orders.edit',
  'pos.access',
  'returns.view',
  'returns.process',
  'customers.view',
  'inventory.view',
  'inventory.manage',
];

async function createTableIfMissing(knex, tableName, callback) {
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) {
    await knex.schema.createTable(tableName, callback);
  }
}

async function addColumnIfMissing(knex, tableName, columnName, callback) {
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) return;

  const columnExists = await knex.schema.hasColumn(tableName, columnName);
  if (!columnExists) {
    await knex.schema.alterTable(tableName, callback);
  }
}

async function dropColumnIfExists(knex, tableName, columnName) {
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) return;

  const columnExists = await knex.schema.hasColumn(tableName, columnName);
  if (columnExists) {
    await knex.schema.alterTable(tableName, (table) => table.dropColumn(columnName));
  }
}

async function ensureUsersAuthColumns(knex) {
  await addColumnIfMissing(knex, 'users', 'oauth_provider', (table) => table.string('oauth_provider', 50));
  await addColumnIfMissing(knex, 'users', 'oauth_id', (table) => table.string('oauth_id', 255));
  await addColumnIfMissing(knex, 'users', 'failed_login_attempts', (table) => table.integer('failed_login_attempts').defaultTo(0));
  await addColumnIfMissing(knex, 'users', 'password_reset_token', (table) => table.string('password_reset_token', 255));
  await addColumnIfMissing(knex, 'users', 'password_reset_expires', (table) => table.timestamp('password_reset_expires'));
  await addColumnIfMissing(knex, 'users', 'email_verification_token', (table) => table.string('email_verification_token', 255));
  await addColumnIfMissing(knex, 'users', 'email_verification_expires', (table) => table.timestamp('email_verification_expires'));
  await addColumnIfMissing(knex, 'users', 'pending_email', (table) => table.string('pending_email', 255));
  await addColumnIfMissing(knex, 'users', 'email_change_token', (table) => table.string('email_change_token', 255));
  await addColumnIfMissing(knex, 'users', 'email_change_expires', (table) => table.timestamp('email_change_expires'));

  await knex.raw('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
}

async function createAuthTables(knex) {
  await createTableIfMissing(knex, 'registration_otps', (table) => {
    table.string('email', 255).primary();
    table.string('otp_hash', 255).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'permissions', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.text('description');
    table.string('category', 50);
  });

  await createTableIfMissing(knex, 'role_permissions', (table) => {
    table.increments('id').primary();
    table.string('role', 50).notNullable();
    table.integer('permission_id').references('id').inTable('permissions').onDelete('CASCADE');
    table.unique(['role', 'permission_id']);
  });

  await createTableIfMissing(knex, 'user_permissions', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.integer('permission_id').references('id').inTable('permissions').onDelete('CASCADE');
    table.boolean('granted').notNullable().defaultTo(true);
    table.unique(['user_id', 'permission_id']);
  });

  await createTableIfMissing(knex, 'oauth_codes', (table) => {
    table.increments('id').primary();
    table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('code_hash', 255).notNullable().unique();
    table.string('ip_address', 45);
    table.text('user_agent');
    table.boolean('used').notNullable().defaultTo(false);
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, 'request_rate_limits', (table) => {
    table.text('key').primary();
    table.integer('request_count').notNullable().defaultTo(0);
    table.timestamp('reset_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

async function createIndexes(knex) {
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_registration_otps_expires ON registration_otps(expires_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_oauth_codes_hash ON oauth_codes(code_hash)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_codes(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_request_rate_limits_reset ON request_rate_limits(reset_at)');

  await knex.raw(`
    ALTER TABLE IF EXISTS registration_otps ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS registration_otps_restricted_access ON registration_otps;
    CREATE POLICY registration_otps_restricted_access
      ON registration_otps
      FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  `);
}

async function seedPermissions(knex) {
  await knex('permissions')
    .insert(DEFAULT_PERMISSIONS)
    .onConflict('name')
    .ignore();

  await knex.raw(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'admin', id FROM permissions
    ON CONFLICT (role, permission_id) DO NOTHING;

    INSERT INTO role_permissions (role, permission_id)
    SELECT 'owner', id FROM permissions
    ON CONFLICT (role, permission_id) DO NOTHING;
  `);

  for (const permissionName of CASHIER_PERMISSIONS) {
    await knex.raw(
      `
        INSERT INTO role_permissions (role, permission_id)
        SELECT 'cashier', id FROM permissions WHERE name = ?
        ON CONFLICT (role, permission_id) DO NOTHING;
      `,
      [permissionName]
    );
  }

  for (const permissionName of STORE_STAFF_PERMISSIONS) {
    await knex.raw(
      `
        INSERT INTO role_permissions (role, permission_id)
        SELECT 'store_staff', id FROM permissions WHERE name = ?
        ON CONFLICT (role, permission_id) DO NOTHING;
      `,
      [permissionName]
    );
  }
}

exports.up = async function up(knex) {
  await ensureUsersAuthColumns(knex);
  await createAuthTables(knex);
  await createIndexes(knex);
  await seedPermissions(knex);
};

exports.down = async function down(knex) {
  await knex.raw('DROP POLICY IF EXISTS registration_otps_restricted_access ON registration_otps');

  await knex.schema.dropTableIfExists('request_rate_limits');
  await knex.schema.dropTableIfExists('oauth_codes');
  await knex.schema.dropTableIfExists('user_permissions');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('registration_otps');

  await dropColumnIfExists(knex, 'users', 'email_change_expires');
  await dropColumnIfExists(knex, 'users', 'email_change_token');
  await dropColumnIfExists(knex, 'users', 'pending_email');
  await dropColumnIfExists(knex, 'users', 'email_verification_expires');
  await dropColumnIfExists(knex, 'users', 'email_verification_token');
  await dropColumnIfExists(knex, 'users', 'password_reset_expires');
  await dropColumnIfExists(knex, 'users', 'password_reset_token');
  await dropColumnIfExists(knex, 'users', 'failed_login_attempts');
  await dropColumnIfExists(knex, 'users', 'oauth_id');
  await dropColumnIfExists(knex, 'users', 'oauth_provider');

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'password_hash'
      ) AND NOT EXISTS (
        SELECT 1
        FROM users
        WHERE password_hash IS NULL
      ) THEN
        ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
      END IF;
    END $$;
  `);
};
