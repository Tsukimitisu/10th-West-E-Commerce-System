-- ============================================================
-- 10th West Moto - Supabase Database Setup
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ==================== TABLES ====================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'cashier')),
  phone VARCHAR(50),
  avatar VARCHAR(500),
  store_credit DECIMAL(10, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  two_factor_secret VARCHAR(255),
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  last_login TIMESTAMP,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products table
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

-- 4. Carts table
CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Cart Items table
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'shipped', 'completed', 'cancelled')),
  shipping_address TEXT NOT NULL,
  source VARCHAR(20) DEFAULT 'online' CHECK (source IN ('online', 'pos')),
  payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'online', 'stripe')),
  amount_tendered DECIMAL(10, 2),
  change_due DECIMAL(10, 2),
  cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  promo_code_used VARCHAR(100),
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Addresses table
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

-- 9. Returns table
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

-- 10. Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  payment_reference VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  method VARCHAR(50) DEFAULT 'original' CHECK (method IN ('original', 'store_credit')),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Store Credits table
CREATE TABLE IF NOT EXISTS store_credits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  reason VARCHAR(255),
  reference_id INTEGER,
  reference_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Support Tickets table
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

-- 13. FAQs table
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Policies table
CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) UNIQUE NOT NULL CHECK (type IN ('return_policy', 'privacy_policy', 'terms_of_service', 'shipping_policy')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Activity Logs table
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

-- 16. Login Attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50)
);

-- 18. Role Permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id)
);

-- 19. User Permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, permission_id)
);

-- 20. Sessions table
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

-- ==================== INDEXES ====================

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
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- ==================== ROW LEVEL SECURITY ====================
-- Using permissive policies for development (anon key has full access).
-- For production, replace these with stricter policies using Supabase Auth.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- ==================== RLS POLICIES ====================
-- Development: allow full access via anon key for all tables.
-- The app handles authorization in its own auth layer.

CREATE POLICY "allow_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON carts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON cart_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON refunds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON store_credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON support_tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON faqs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON policies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON activity_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON login_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON role_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON user_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sessions FOR ALL USING (true) WITH CHECK (true);

-- ==================== SEED DATA ====================

-- Seed Categories
INSERT INTO categories (name) VALUES
  ('NMAX V1'), ('NMAX V2'), ('AEROX V1'), ('AEROX V2'),
  ('M3 MIO'), ('CLICK 150'), ('CLICK 125'), ('BEAT V2'),
  ('Universal Parts'), ('AEROX'), ('NMAX'), ('M3 Honda Beat'),
  ('Honda Click'), ('Mio'), ('Sniper'), ('Wave'),
  ('TMX'), ('XRM'), ('Raider'), ('Mio Soul'),
  ('PCX'), ('ADV'), ('CBR')
ON CONFLICT (name) DO NOTHING;

-- Seed Products
INSERT INTO products (part_number, name, description, price, buying_price, image, category_id, stock_quantity, box_number, low_stock_threshold, brand, sku, barcode) VALUES
  ('2DP-H2129-00', 'Battery Cover', 'Original Yamaha Battery Cover for NMAX V1.',
   150.00, 104.00, 'https://images.unsplash.com/photo-1558564175-99645903c7bb?auto=format&fit=crop&q=80&w=400',
   1, 2, '2F STAIRS', 2, 'Yamaha', 'SKU-001', '123456789012'),

  ('2DP-F8351-00-P1', 'Body Cowling Pearl White (46)', 'Side body cowling in Pearl White finish.',
   800.00, 448.00, 'https://images.unsplash.com/photo-1598616345941-86560965a3d7?auto=format&fit=crop&q=80&w=400',
   1, 4, '46', 3, 'Yamaha', 'SKU-002', '123456789013'),

  ('2DP-F8351-00-P5', 'Body Cowling Matte Red (37)', 'Side body cowling in Matte Red finish.',
   600.00, 560.00, 'https://images.unsplash.com/photo-1578844251758-2f71da645217?auto=format&fit=crop&q=80&w=400',
   1, 7, '37', 3, 'Yamaha', 'SKU-003', '123456789014'),

  ('2DP-E4412-00', 'Cap Cleaner Case Outer', 'Outer casing for air cleaner.',
   500.00, 343.00, 'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=400',
   1, 5, '2F STAIRS', 2, 'Yamaha', 'SKU-004', '123456789015'),

  ('2DP-F2865-00-P7', 'Cover Front Matte Black (43)', 'Front cover panel matte black.',
   700.00, 509.00, 'https://images.unsplash.com/photo-1622185135505-2d795043906a?auto=format&fit=crop&q=80&w=400',
   1, 6, '43', 3, 'Yamaha', 'SKU-005', '123456789016'),

  ('UNIV-OIL-1040', 'Motul 7100 4T 10W-40', '100% synthetic 4-stroke lubricant.',
   650.00, 450.00, 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&q=80&w=400',
   9, 45, 'SHELF A1', 10, 'Motul', 'SKU-006', '123456789017')
ON CONFLICT (part_number) DO NOTHING;

-- Seed Users (password is bcrypt hash of 'admin123', 'cashier123', 'customer123')
INSERT INTO users (name, email, password_hash, role, phone, is_active, email_verified) VALUES
  ('Admin User', 'admin@10thwest.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', '555-0001', true, true),
  ('Cashier Staff', 'cashier@10thwest.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'cashier', '555-0002', true, true),
  ('Moto Rider', 'customer@10thwest.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'customer', '555-0101', true, true)
ON CONFLICT (email) DO NOTHING;

-- Seed Permissions
INSERT INTO permissions (name, description, category) VALUES
  ('products.view', 'View products', 'Products'),
  ('products.create', 'Create products', 'Products'),
  ('products.edit', 'Edit products', 'Products'),
  ('products.delete', 'Delete products', 'Products'),
  ('orders.view', 'View orders', 'Orders'),
  ('orders.edit', 'Edit order status', 'Orders'),
  ('orders.refund', 'Process refunds', 'Orders'),
  ('customers.view', 'View customers', 'Customers'),
  ('customers.edit', 'Edit customers', 'Customers'),
  ('reports.view', 'View reports', 'Reports'),
  ('staff.view', 'View staff', 'Staff'),
  ('staff.manage', 'Manage staff', 'Staff'),
  ('settings.manage', 'Manage settings', 'Settings'),
  ('pos.access', 'Access POS terminal', 'POS'),
  ('returns.view', 'View returns', 'Returns'),
  ('returns.process', 'Process returns', 'Returns'),
  ('inventory.view', 'View inventory', 'Inventory'),
  ('inventory.manage', 'Manage inventory', 'Inventory')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to admin role
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- Assign cashier permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'cashier', id FROM permissions WHERE name IN (
  'products.view', 'orders.view', 'orders.edit',
  'pos.access', 'returns.view', 'customers.view', 'inventory.view'
)
ON CONFLICT DO NOTHING;

-- Seed FAQs
INSERT INTO faqs (question, answer, display_order, is_active) VALUES
  ('What is your return policy?', 'We accept returns within 30 days of purchase for most items. Items must be in original condition with all packaging.', 1, true),
  ('How long does shipping take?', 'Standard shipping typically takes 3-5 business days. Expedited shipping options are available at checkout.', 2, true),
  ('Do you ship internationally?', 'Currently, we only ship within the Philippines. We are working on expanding our shipping options.', 3, true),
  ('How can I track my order?', 'You can track your order by logging into your account and viewing your order history.', 4, true),
  ('What payment methods do you accept?', 'We accept all major credit cards, PayPal, cash (in-store), and store credit.', 5, true),
  ('Can I cancel or modify my order?', 'Orders can be cancelled or modified within 1 hour of placement. Contact support immediately.', 6, true),
  ('Do you offer warranties on parts?', 'Most parts come with manufacturer warranties ranging from 90 days to 1 year.', 7, true),
  ('How do I know if a part fits my motorcycle?', 'Each product page includes compatibility information. Contact support for assistance.', 8, true);

-- Seed Policies
INSERT INTO policies (type, title, content) VALUES
  ('return_policy', 'Return & Exchange Policy', '<h2>Return Policy</h2><p>We accept returns within 30 days of purchase. Items must be in original condition.</p>'),
  ('shipping_policy', 'Shipping Policy', '<h2>Shipping Information</h2><p>Standard 3-5 business days. Free shipping on orders over ₱2,500.</p>'),
  ('privacy_policy', 'Privacy Policy', '<h2>Privacy Policy</h2><p>We collect and protect your personal information. We do not sell your data.</p>'),
  ('terms_of_service', 'Terms of Service', '<h2>Terms of Service</h2><p>By using our service you agree to these terms.</p>')
ON CONFLICT (type) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;
