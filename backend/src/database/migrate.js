import pool from '../config/database.js';

const createTables = async () => {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting database migration...');

    // ============================================================
    // EXISTING TABLES
    // ============================================================

    // Create Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'cashier', 'super_admin', 'owner', 'store_staff')),
        phone VARCHAR(50),
        avatar VARCHAR(500),
        store_credit DECIMAL(10, 2) DEFAULT 0.00,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        two_factor_secret VARCHAR(255),
        email_verified BOOLEAN DEFAULT FALSE,
        consent_given_at TIMESTAMP,
        age_confirmed_at TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table created');

    // Create Categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Categories table created');

    // Create Subcategories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Subcategories table created');

    // Create Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        part_number VARCHAR(100) UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        buying_price DECIMAL(10, 2),
        image VARCHAR(500),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
        stock_quantity INTEGER DEFAULT 0,
        box_number VARCHAR(100),
        low_stock_threshold INTEGER DEFAULT 5,
        brand VARCHAR(100),
        sku VARCHAR(100) UNIQUE,
        barcode VARCHAR(100) UNIQUE,
        sale_price DECIMAL(10, 2),
        is_on_sale BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'hidden', 'out_of_stock')),
        expiry_date DATE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Products table created');

    // Create Product Variants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        variant_type VARCHAR(50) NOT NULL,
        variant_value VARCHAR(100) NOT NULL,
        price_adjustment DECIMAL(10, 2) DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        sku VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Product Variants table created');

    // Create Carts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Carts table created');

    // Create Cart Items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL PRIMARY KEY,
        cart_id INTEGER REFERENCES carts(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Cart Items table created');

    // Create Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        guest_name VARCHAR(255),
        guest_email VARCHAR(255),
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'paid', 'shipped', 'completed', 'cancelled')),
        shipping_address TEXT NOT NULL,
        source VARCHAR(20) DEFAULT 'online' CHECK (source IN ('online', 'pos')),
        payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'cod', 'online', 'stripe', 'gcash', 'maya', 'bank_transfer')),
        amount_tendered DECIMAL(10, 2),
        change_due DECIMAL(10, 2),
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0.00,
        promo_code_used VARCHAR(100),
        payment_intent_id VARCHAR(255),
        tracking_number VARCHAR(255),
        assigned_staff_id INTEGER REFERENCES users(id),
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        shipping_method VARCHAR(50) DEFAULT 'standard',
        delivery_notes TEXT,
        estimated_delivery DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Orders table created');

    // Create Order Items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(255) NOT NULL,
        product_price DECIMAL(10, 2) NOT NULL,
        quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Order Items table created');

    // Create Addresses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        street TEXT NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Addresses table created');

    // Create Returns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'exchanged')),
        refund_amount DECIMAL(10, 2) NOT NULL,
        return_type VARCHAR(20) DEFAULT 'online' CHECK (return_type IN ('online', 'in-store')),
        items JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Returns table created');

    // Create Refunds table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id SERIAL PRIMARY KEY,
        return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
        payment_reference VARCHAR(255),
        amount DECIMAL(10, 2) NOT NULL,
        method VARCHAR(50) DEFAULT 'original' CHECK (method IN ('original', 'store_credit')),
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Refunds table created');

    // Create Store Credits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_credits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        reason VARCHAR(255),
        reference_id INTEGER,
        reference_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Store Credits table created');

    // Create Support Tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Support Tickets table created');

    // Create FAQs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ FAQs table created');

    // Create Policies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) UNIQUE NOT NULL CHECK (type IN ('return_policy', 'privacy_policy', 'terms_of_service', 'shipping_policy')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Policies table created');

    // ============================================================
    // NEW TABLES
    // ============================================================

    // Create Suppliers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Suppliers table created');

    // Create Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        reference_id INTEGER,
        reference_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Notifications table created');

    // Create Banners table
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        subtitle TEXT,
        image_url VARCHAR(500),
        link_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Banners table created');

    // Create Announcements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_published BOOLEAN DEFAULT FALSE,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Announcements table created');

    // Create Stock Adjustments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        adjusted_by INTEGER REFERENCES users(id),
        quantity_change INTEGER NOT NULL,
        reason VARCHAR(50) CHECK (reason IN ('damaged', 'lost', 'correction', 'transfer', 'received', 'expired')),
        notes TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        approved_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Stock Adjustments table created');

    // Create Device History table
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        device_info TEXT,
        ip_address VARCHAR(50),
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location VARCHAR(255)
      );
    `);
    console.log('✅ Device History table created');

    // Create Activity Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        details JSONB,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Activity Logs table created');

    // Create Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        ip_address VARCHAR(50),
        user_agent TEXT,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Sessions table created');

    // Create Wishlists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
    `);
    console.log('✅ Wishlists table created');

    // Create Reviews table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        is_approved BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Reviews table created');

    // Create Discounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discounts (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(20) CHECK (type IN ('percentage', 'fixed')),
        value DECIMAL(10, 2) NOT NULL,
        min_purchase DECIMAL(10, 2) DEFAULT 0,
        max_uses INTEGER,
        used_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        starts_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Discounts table created');

    // Create Shipping Rates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_rates (
        id SERIAL PRIMARY KEY,
        method VARCHAR(50) NOT NULL,
        label VARCHAR(100),
        base_fee DECIMAL(10, 2) DEFAULT 0,
        min_purchase_free DECIMAL(10, 2),
        estimated_days VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log('✅ Shipping Rates table created');

    // Create System Settings table (key-value config store)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        key VARCHAR(100) NOT NULL,
        value TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key)
      );
    `);
    console.log('✅ System Settings table created');

    // Create Error Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        error_type VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        stack_trace TEXT,
        endpoint VARCHAR(255),
        user_id INTEGER REFERENCES users(id),
        ip_address VARCHAR(50),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Error Logs table created');

    // Create Login Attempts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(50),
        success BOOLEAN DEFAULT FALSE,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Login Attempts table created');

    // Create Backup History table
    await client.query(`
      CREATE TABLE IF NOT EXISTS backup_history (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(20) NOT NULL,
        file_name VARCHAR(255),
        file_size BIGINT,
        status VARCHAR(20) DEFAULT 'pending',
        initiated_by INTEGER REFERENCES users(id),
        error_message TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Backup History table created');

    // Seed default system settings
    await client.query(`
      INSERT INTO system_settings (category, key, value) VALUES
        ('security', 'max_login_attempts', '5'),
        ('security', 'lockout_duration_minutes', '15'),
        ('security', 'password_min_length', '8'),
        ('security', 'password_require_uppercase', 'true'),
        ('security', 'password_require_lowercase', 'true'),
        ('security', 'password_require_number', 'true'),
        ('security', 'password_require_special', 'true'),
        ('security', 'session_timeout_minutes', '30'),
        ('security', '2fa_enforcement', 'optional'),
        ('store', 'name', '10th West Moto'),
        ('store', 'tagline', 'Motorcycle Parts & Accessories'),
        ('store', 'email', 'admin@10thwestmoto.com'),
        ('store', 'phone', '+63 XXX XXX XXXX'),
        ('store', 'address', 'Manila, Philippines'),
        ('store', 'currency', 'PHP'),
        ('store', 'timezone', 'Asia/Manila'),
        ('store', 'logo_url', ''),
        ('tax', 'enabled', 'true'),
        ('tax', 'rate', '12'),
        ('tax', 'name', 'VAT'),
        ('tax', 'inclusive', 'true'),
        ('shipping', 'free_threshold', '3000'),
        ('shipping', 'flat_rate', '150'),
        ('shipping', 'express_rate', '350'),
        ('shipping', 'enable_pickup', 'true'),
        ('payment', 'cash_enabled', 'true'),
        ('payment', 'card_enabled', 'true'),
        ('payment', 'gcash_enabled', 'false'),
        ('payment', 'maya_enabled', 'false'),
        ('payment', 'stripe_pk', ''),
        ('payment', 'stripe_sk', ''),
        ('email', 'order_confirmation', 'true'),
        ('email', 'shipping_update', 'true'),
        ('email', 'return_approval', 'true'),
        ('email', 'promotions', 'false'),
        ('email', 'from_name', '10th West Moto'),
        ('email', 'from_email', 'noreply@10thwestmoto.com')
      ON CONFLICT (category, key) DO NOTHING;
    `);
    console.log('✅ Default system settings seeded');

    // ============================================================
    // ALTER TABLES - Add new columns to existing tables
    // (wrapped in try/catch for safety on re-runs)
    // ============================================================

    // -- Users table: new columns --
    const usersNewColumns = [
      { name: 'login_attempts', definition: 'INTEGER DEFAULT 0' },
      { name: 'locked_until', definition: 'TIMESTAMP' },
      { name: 'is_deleted', definition: 'BOOLEAN DEFAULT FALSE' },
      { name: 'is_active', definition: 'BOOLEAN DEFAULT TRUE' },
      { name: 'two_factor_enabled', definition: 'BOOLEAN DEFAULT FALSE' },
      { name: 'two_factor_secret', definition: 'VARCHAR(255)' },
      { name: 'email_verified', definition: 'BOOLEAN DEFAULT FALSE' },
      { name: 'last_login', definition: 'TIMESTAMP' },
    ];

    for (const col of usersNewColumns) {
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
      } catch (err) {
        console.log(`⚠️  Column users.${col.name} may already exist, skipping: ${err.message}`);
      }
    }
    console.log('✅ Users table columns updated');

    // -- Products table: new columns --
    const productsNewColumns = [
      { name: 'status', definition: "VARCHAR(20) DEFAULT 'available'" },
      { name: 'expiry_date', definition: 'DATE' },
      { name: 'is_deleted', definition: 'BOOLEAN DEFAULT FALSE' },
      { name: 'subcategory_id', definition: 'INTEGER REFERENCES subcategories(id) ON DELETE SET NULL' },
    ];

    for (const col of productsNewColumns) {
      try {
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
      } catch (err) {
        console.log(`⚠️  Column products.${col.name} may already exist, skipping: ${err.message}`);
      }
    }
    console.log('✅ Products table columns updated');

    // -- Orders table: new columns --
    const ordersNewColumns = [
      { name: 'tracking_number', definition: 'VARCHAR(255)' },
      { name: 'assigned_staff_id', definition: 'INTEGER REFERENCES users(id)' },
      { name: 'tax_amount', definition: 'DECIMAL(10,2) DEFAULT 0' },
      { name: 'shipping_method', definition: "VARCHAR(50) DEFAULT 'standard'" },
      { name: 'delivery_notes', definition: 'TEXT' },
      { name: 'estimated_delivery', definition: 'DATE' },
    ];

    for (const col of ordersNewColumns) {
      try {
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
      } catch (err) {
        console.log(`⚠️  Column orders.${col.name} may already exist, skipping: ${err.message}`);
      }
    }
    console.log('✅ Orders table columns updated');

    // ============================================================
    // INDEXES
    // ============================================================

    // Existing indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
      CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
      CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
      CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds(return_id);
      CREATE INDEX IF NOT EXISTS idx_store_credits_user ON store_credits(user_id);
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
    `);
    console.log('✅ Existing indexes created');

    // New indexes for new tables and columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_by ON stock_adjustments(adjusted_by);
      CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON stock_adjustments(approved_by);
      CREATE INDEX IF NOT EXISTS idx_device_history_user ON device_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
      CREATE INDEX IF NOT EXISTS idx_orders_assigned_staff ON orders(assigned_staff_id);
      CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
      CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
      CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
    `);
    console.log('✅ New indexes created');

    // Alter activity_logs to add missing columns
    const activityLogsNewColumns = [
      { name: 'entity_type', definition: 'VARCHAR(50)' },
      { name: 'entity_id', definition: 'INTEGER' },
      { name: 'user_agent', definition: 'TEXT' },
    ];
    for (const col of activityLogsNewColumns) {
      try {
        await client.query(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
      } catch (err) {
        console.log(`⚠️  Column activity_logs.${col.name} may already exist, skipping: ${err.message}`);
      }
    }
    console.log('✅ Activity Logs table columns updated');

    console.log('🎉 Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration
createTables()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
