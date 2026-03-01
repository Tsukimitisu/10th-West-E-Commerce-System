import pool from '../config/database.js';

const migrateAuth = async () => {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting Auth & Staff migration...\n');

    // ── 1. Add new columns to users table ──────────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
        ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255),
        ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    `);
    // Make password_hash nullable for OAuth-only users
    await client.query(`
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    `);
    console.log('✅ Users table updated with auth columns');

    // ── 2. Activity Logs table ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
    `);
    console.log('✅ Activity Logs table created');

    // ── 3. Login attempts table (rate limiting / lockout) ──────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        success BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
    `);
    console.log('✅ Login Attempts table created');

    // ── 4. Staff permissions table ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        category VARCHAR(50)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        UNIQUE(role, permission_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        granted BOOLEAN DEFAULT TRUE,
        UNIQUE(user_id, permission_id)
      );
    `);
    console.log('✅ Permissions tables created');

    // ── 5. Seed default permissions ────────────────────────────────
    const perms = [
      ['products.view', 'View products', 'Products'],
      ['products.create', 'Create products', 'Products'],
      ['products.edit', 'Edit products', 'Products'],
      ['products.delete', 'Delete products', 'Products'],
      ['orders.view', 'View orders', 'Orders'],
      ['orders.edit', 'Edit order status', 'Orders'],
      ['orders.refund', 'Process refunds', 'Orders'],
      ['customers.view', 'View customers', 'Customers'],
      ['customers.edit', 'Edit customers', 'Customers'],
      ['reports.view', 'View reports', 'Reports'],
      ['staff.view', 'View staff', 'Staff'],
      ['staff.manage', 'Manage staff', 'Staff'],
      ['settings.manage', 'Manage settings', 'Settings'],
      ['pos.access', 'Access POS terminal', 'POS'],
      ['returns.view', 'View returns', 'Returns'],
      ['returns.process', 'Process returns', 'Returns'],
      ['inventory.view', 'View inventory', 'Inventory'],
      ['inventory.manage', 'Manage inventory', 'Inventory'],
    ];

    for (const [name, desc, cat] of perms) {
      await client.query(
        `INSERT INTO permissions (name, description, category) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
        [name, desc, cat]
      );
    }
    console.log('✅ Default permissions seeded');

    // Assign all permissions to admin role
    await client.query(`
      INSERT INTO role_permissions (role, permission_id)
      SELECT 'admin', id FROM permissions
      ON CONFLICT DO NOTHING;
    `);

    // Assign cashier permissions
    const cashierPerms = [
      'products.view', 'orders.view', 'orders.edit',
      'pos.access', 'returns.view', 'customers.view', 'inventory.view'
    ];
    for (const perm of cashierPerms) {
      await client.query(`
        INSERT INTO role_permissions (role, permission_id)
        SELECT 'cashier', id FROM permissions WHERE name = $1
        ON CONFLICT DO NOTHING;
      `, [perm]);
    }

    // Assign owner all permissions (like admin)
    await client.query(`
      INSERT INTO role_permissions (role, permission_id)
      SELECT 'owner', id FROM permissions
      ON CONFLICT DO NOTHING;
    `);

    // Assign store_staff permissions
    const storeStaffPerms = [
      'products.view', 'orders.view', 'orders.edit',
      'pos.access', 'returns.view', 'returns.process',
      'customers.view', 'inventory.view', 'inventory.manage'
    ];
    for (const perm of storeStaffPerms) {
      await client.query(`
        INSERT INTO role_permissions (role, permission_id)
        SELECT 'store_staff', id FROM permissions WHERE name = $1
        ON CONFLICT DO NOTHING;
      `, [perm]);
    }

    console.log('✅ Role permissions assigned');

    // ── 6. Sessions table (for session management) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    `);
    console.log('✅ Sessions table created');

    console.log('\n🎉 Auth & Staff migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

migrateAuth()
  .then(() => { console.log('✨ All done!'); process.exit(0); })
  .catch((err) => { console.error('Fatal error:', err); process.exit(1); });
