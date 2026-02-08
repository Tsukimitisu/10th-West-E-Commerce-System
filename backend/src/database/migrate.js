import pool from '../config/database.js';

const createTables = async () => {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting database migration...');

    // Create Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'cashier')),
        phone VARCHAR(50),
        avatar VARCHAR(500),
        store_credit DECIMAL(10, 2) DEFAULT 0.00,
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
        stock_quantity INTEGER DEFAULT 0,
        box_number VARCHAR(100),
        low_stock_threshold INTEGER DEFAULT 5,
        brand VARCHAR(100),
        sku VARCHAR(100) UNIQUE,
        barcode VARCHAR(100) UNIQUE,
        sale_price DECIMAL(10, 2),
        is_on_sale BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Products table created');

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
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
        shipping_address TEXT NOT NULL,
        source VARCHAR(20) DEFAULT 'online' CHECK (source IN ('online', 'pos')),
        payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'cod', 'online', 'stripe')),
        amount_tendered DECIMAL(10, 2),
        change_due DECIMAL(10, 2),
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0.00,
        promo_code_used VARCHAR(100),
        payment_intent_id VARCHAR(255),
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

    // Create indexes for performance
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
    console.log('✅ Indexes created');

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
