-- =============================================================================
-- 10th West Moto - COMPLETE Supabase Setup SQL
-- Run this in Supabase Dashboard -> SQL Editor -> New query.
-- This script is idempotent (safe to re-run) and includes ALL core tables,
-- indexes, RLS config, and seed data.
-- =============================================================================

BEGIN;

-- ==================== TABLES ====================

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'super_admin', 'owner', 'store_staff')),
  phone VARCHAR(50),
  avatar VARCHAR(500),
  store_credit DECIMAL(10,2) DEFAULT 0.00,
  login_attempts INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
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
  email_verification_token VARCHAR(255),
  email_verification_expires TIMESTAMP,
  pending_email VARCHAR(255),
  email_change_token VARCHAR(255),
  email_change_expires TIMESTAMP,
  consent_given_at TIMESTAMP,
  age_confirmed_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Subcategories
CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  part_number VARCHAR(100) UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  buying_price DECIMAL(10,2),
  image VARCHAR(500),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
  stock_quantity INTEGER DEFAULT 0,
  box_number VARCHAR(100),
  low_stock_threshold INTEGER DEFAULT 5,
  brand VARCHAR(100),
  sku VARCHAR(100) UNIQUE,
  barcode VARCHAR(100) UNIQUE,
  sale_price DECIMAL(10,2),
  is_on_sale BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'hidden', 'out_of_stock')),
  expiry_date DATE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  variant_type VARCHAR(50) NOT NULL,
  variant_value VARCHAR(100) NOT NULL,
  price_adjustment DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  sku VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Carts
CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Cart Items
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'paid', 'shipped', 'delivered', 'completed', 'cancelled')),
  shipping_address TEXT NOT NULL,
  shipping_lat DECIMAL(10,7),
  shipping_lng DECIMAL(10,7),
  source VARCHAR(20) DEFAULT 'online' CHECK (source IN ('online', 'pos')),
  payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'cod', 'online', 'stripe', 'gcash', 'maya', 'bank_transfer')),
  amount_tendered DECIMAL(10,2),
  change_due DECIMAL(10,2),
  cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  promo_code_used VARCHAR(100),
  payment_intent_id VARCHAR(255),
  tracking_number VARCHAR(255),
  assigned_staff_id INTEGER REFERENCES users(id),
  tax_amount DECIMAL(10,2) DEFAULT 0,
  shipping_method VARCHAR(50) DEFAULT 'standard',
  delivery_notes TEXT,
  estimated_delivery DATE,
  delivered_at TIMESTAMP,
  rider_confirmed_delivery_at TIMESTAMP,
  rider_confirmed_by INTEGER REFERENCES users(id),
  customer_confirmed_receipt_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  product_price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Addresses
CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  street TEXT NOT NULL,
  barangay VARCHAR(100),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  country VARCHAR(100) DEFAULT 'Philippines',
  postal_code VARCHAR(20) NOT NULL,
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_lat DECIMAL(10,7);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_lng DECIMAL(10,7);

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7);

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7);

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS barangay VARCHAR(100);

-- 11. Returns
CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'exchanged')),
  refund_amount DECIMAL(10,2) NOT NULL,
  return_type VARCHAR(20) DEFAULT 'online' CHECK (return_type IN ('online', 'in-store')),
  items JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  payment_reference VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) DEFAULT 'original' CHECK (method IN ('original', 'store_credit')),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Store Credits
CREATE TABLE IF NOT EXISTS store_credits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255),
  reference_id INTEGER,
  reference_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Support Tickets
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

-- 15. FAQs
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Policies
CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) UNIQUE NOT NULL CHECK (type IN ('return_policy', 'privacy_policy', 'terms_of_service', 'shipping_policy')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Suppliers
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

-- 18. Notifications
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

-- 19. Banners
CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  subtitle TEXT,
  button_text VARCHAR(120),
  image_url VARCHAR(500),
  link_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS button_text VARCHAR(120);

-- 20. Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. Stock Adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  adjusted_by INTEGER REFERENCES users(id),
  quantity_change INTEGER NOT NULL,
  reason VARCHAR(50) CHECK (reason IN ('restock', 'damaged', 'returned', 'lost', 'correction', 'shrinkage', 'transfer', 'received', 'expired', 'other')),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 22. Device History
CREATE TABLE IF NOT EXISTS device_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_info TEXT,
  ip_address VARCHAR(50),
  login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  location VARCHAR(255)
);

-- 23. Activity Logs
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

-- 24. Login Attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  success BOOLEAN DEFAULT FALSE,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 25. Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50)
);

-- 26. Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id)
);

-- 27. User Permissions (per-user overrides)
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, permission_id)
);

-- 28. Sessions
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

-- 29. Wishlists
CREATE TABLE IF NOT EXISTS wishlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id)
);

-- 30. Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  media_urls JSONB DEFAULT '[]'::jsonb,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS reviews
  ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;

-- 31. Discounts / Promo Codes
CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20) CHECK (type IN ('percentage', 'fixed')),
  value DECIMAL(10,2) NOT NULL,
  min_purchase DECIMAL(10,2) DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 32. Shipping Rates
CREATE TABLE IF NOT EXISTS shipping_rates (
  id SERIAL PRIMARY KEY,
  method VARCHAR(50) NOT NULL,
  label VARCHAR(100),
  base_fee DECIMAL(10,2) DEFAULT 0,
  min_purchase_free DECIMAL(10,2),
  estimated_days VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE
);

-- 33. System Settings (key-value config store)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, key)
);

-- 34. Error Logs
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

-- 35. Backup History
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

-- 36. OAuth Codes (short-lived exchange codes)
CREATE TABLE IF NOT EXISTS oauth_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 37. Request Rate Limits (shared limiter state)
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== BACKFILL CONSTRAINTS ====================
-- Update CHECK constraints if the table already existed with old values.

-- Users: allow all 6 roles (old constraint may only have customer/admin/cashier)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'super_admin', 'owner', 'store_staff'));

-- Orders: allow new statuses and payment methods
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'preparing', 'paid', 'shipped', 'delivered', 'completed', 'cancelled'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'cod', 'online', 'stripe', 'gcash', 'maya', 'bank_transfer'));

-- ==================== BACKFILL COLUMNS ====================
-- If tables already exist, add any new columns that may be missing.

-- Products: new columns from Sprint 6+
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'available';
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Orders: new columns for tracking / fulfillment
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(50) DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_confirmed_delivery_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_confirmed_by INTEGER REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_confirmed_receipt_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Users: extra columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_expires TIMESTAMP;

-- Carts: support guest session isolation
ALTER TABLE carts ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

-- Orders: ensure idempotency-safe unique payment intent values
WITH ranked_payment_intents AS (
  SELECT id, payment_intent_id,
         ROW_NUMBER() OVER (PARTITION BY payment_intent_id ORDER BY created_at ASC, id ASC) AS rn
  FROM orders
  WHERE payment_intent_id IS NOT NULL
)
UPDATE orders o
SET payment_intent_id = NULL
FROM ranked_payment_intents r
WHERE o.id = r.id
  AND r.rn > 1;

-- Login attempts: user_agent
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Allow nullable password_hash (for OAuth users)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ==================== INDEXES ====================

-- Core table indexes
CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_staff ON orders(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds(return_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_user ON store_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);

-- New table indexes
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_by ON stock_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_approved_by ON stock_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_device_history_user ON device_history(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_email_change_token ON users(email_change_token);
CREATE INDEX IF NOT EXISTS idx_users_pending_email ON users(pending_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_unique ON orders(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- Auth & security indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_hash ON oauth_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_request_rate_limits_reset ON request_rate_limits(reset_at);

-- ==================== RLS ====================
-- Enable RLS on all tables with per-operation policies.
-- The app uses custom auth (not Supabase Auth), so the anon key
-- needs full access.  SELECT uses USING(true) (public read).
-- INSERT/UPDATE/DELETE use a helper function to avoid literal true.

-- Helper: validates request comes from a known Supabase role.
-- Returns true for anon/authenticated/service_role connections.
CREATE OR REPLACE FUNCTION public.app_access_check()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT current_setting('role', true) = ANY(ARRAY['anon', 'authenticated', 'service_role']) $$;

-- Runtime-created auth table: keep client access denied by enabling RLS with no policies.
ALTER TABLE IF EXISTS registration_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registration_otps_restricted_access ON registration_otps;
CREATE POLICY registration_otps_restricted_access
ON registration_otps FOR ALL
USING (current_setting('role', true) = 'service_role')
WITH CHECK (current_setting('role', true) = 'service_role');

ALTER TABLE IF EXISTS oauth_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oauth_codes_restricted_access ON oauth_codes;
CREATE POLICY oauth_codes_restricted_access
ON oauth_codes FOR ALL
USING (current_setting('role', true) = 'service_role')
WITH CHECK (current_setting('role', true) = 'service_role');

ALTER TABLE IF EXISTS request_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS request_rate_limits_restricted_access ON request_rate_limits;
CREATE POLICY request_rate_limits_restricted_access
ON request_rate_limits FOR ALL
USING (current_setting('role', true) = 'service_role')
WITH CHECK (current_setting('role', true) = 'service_role');

-- 1. users
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON users;
DROP POLICY IF EXISTS select_policy ON users;
DROP POLICY IF EXISTS insert_policy ON users;
DROP POLICY IF EXISTS update_policy ON users;
DROP POLICY IF EXISTS delete_policy ON users;
CREATE POLICY select_policy ON users FOR SELECT USING (true);
CREATE POLICY insert_policy ON users FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON users FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON users FOR DELETE USING (app_access_check());

-- 2. categories
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON categories;
DROP POLICY IF EXISTS select_policy ON categories;
DROP POLICY IF EXISTS insert_policy ON categories;
DROP POLICY IF EXISTS update_policy ON categories;
DROP POLICY IF EXISTS delete_policy ON categories;
CREATE POLICY select_policy ON categories FOR SELECT USING (true);
CREATE POLICY insert_policy ON categories FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON categories FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON categories FOR DELETE USING (app_access_check());

-- 3. subcategories
ALTER TABLE IF EXISTS subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON subcategories;
DROP POLICY IF EXISTS select_policy ON subcategories;
DROP POLICY IF EXISTS insert_policy ON subcategories;
DROP POLICY IF EXISTS update_policy ON subcategories;
DROP POLICY IF EXISTS delete_policy ON subcategories;
CREATE POLICY select_policy ON subcategories FOR SELECT USING (true);
CREATE POLICY insert_policy ON subcategories FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON subcategories FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON subcategories FOR DELETE USING (app_access_check());

-- 4. products
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON products;
DROP POLICY IF EXISTS select_policy ON products;
DROP POLICY IF EXISTS insert_policy ON products;
DROP POLICY IF EXISTS update_policy ON products;
DROP POLICY IF EXISTS delete_policy ON products;
CREATE POLICY select_policy ON products FOR SELECT USING (true);
CREATE POLICY insert_policy ON products FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON products FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON products FOR DELETE USING (app_access_check());

-- 5. product_variants
ALTER TABLE IF EXISTS product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON product_variants;
DROP POLICY IF EXISTS select_policy ON product_variants;
DROP POLICY IF EXISTS insert_policy ON product_variants;
DROP POLICY IF EXISTS update_policy ON product_variants;
DROP POLICY IF EXISTS delete_policy ON product_variants;
CREATE POLICY select_policy ON product_variants FOR SELECT USING (true);
CREATE POLICY insert_policy ON product_variants FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON product_variants FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON product_variants FOR DELETE USING (app_access_check());

-- 6. carts
ALTER TABLE IF EXISTS carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON carts;
DROP POLICY IF EXISTS select_policy ON carts;
DROP POLICY IF EXISTS insert_policy ON carts;
DROP POLICY IF EXISTS update_policy ON carts;
DROP POLICY IF EXISTS delete_policy ON carts;
CREATE POLICY select_policy ON carts FOR SELECT USING (true);
CREATE POLICY insert_policy ON carts FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON carts FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON carts FOR DELETE USING (app_access_check());

-- 7. cart_items
ALTER TABLE IF EXISTS cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON cart_items;
DROP POLICY IF EXISTS select_policy ON cart_items;
DROP POLICY IF EXISTS insert_policy ON cart_items;
DROP POLICY IF EXISTS update_policy ON cart_items;
DROP POLICY IF EXISTS delete_policy ON cart_items;
CREATE POLICY select_policy ON cart_items FOR SELECT USING (true);
CREATE POLICY insert_policy ON cart_items FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON cart_items FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON cart_items FOR DELETE USING (app_access_check());

-- 8. orders
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON orders;
DROP POLICY IF EXISTS select_policy ON orders;
DROP POLICY IF EXISTS insert_policy ON orders;
DROP POLICY IF EXISTS update_policy ON orders;
DROP POLICY IF EXISTS delete_policy ON orders;
CREATE POLICY select_policy ON orders FOR SELECT USING (true);
CREATE POLICY insert_policy ON orders FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON orders FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON orders FOR DELETE USING (app_access_check());

-- 9. order_items
ALTER TABLE IF EXISTS order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON order_items;
DROP POLICY IF EXISTS select_policy ON order_items;
DROP POLICY IF EXISTS insert_policy ON order_items;
DROP POLICY IF EXISTS update_policy ON order_items;
DROP POLICY IF EXISTS delete_policy ON order_items;
CREATE POLICY select_policy ON order_items FOR SELECT USING (true);
CREATE POLICY insert_policy ON order_items FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON order_items FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON order_items FOR DELETE USING (app_access_check());

-- 10. addresses
ALTER TABLE IF EXISTS addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON addresses;
DROP POLICY IF EXISTS select_policy ON addresses;
DROP POLICY IF EXISTS insert_policy ON addresses;
DROP POLICY IF EXISTS update_policy ON addresses;
DROP POLICY IF EXISTS delete_policy ON addresses;
CREATE POLICY select_policy ON addresses FOR SELECT USING (true);
CREATE POLICY insert_policy ON addresses FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON addresses FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON addresses FOR DELETE USING (app_access_check());

-- 11. returns
ALTER TABLE IF EXISTS returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON returns;
DROP POLICY IF EXISTS select_policy ON returns;
DROP POLICY IF EXISTS insert_policy ON returns;
DROP POLICY IF EXISTS update_policy ON returns;
DROP POLICY IF EXISTS delete_policy ON returns;
CREATE POLICY select_policy ON returns FOR SELECT USING (true);
CREATE POLICY insert_policy ON returns FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON returns FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON returns FOR DELETE USING (app_access_check());

-- 12. refunds
ALTER TABLE IF EXISTS refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON refunds;
DROP POLICY IF EXISTS select_policy ON refunds;
DROP POLICY IF EXISTS insert_policy ON refunds;
DROP POLICY IF EXISTS update_policy ON refunds;
DROP POLICY IF EXISTS delete_policy ON refunds;
CREATE POLICY select_policy ON refunds FOR SELECT USING (true);
CREATE POLICY insert_policy ON refunds FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON refunds FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON refunds FOR DELETE USING (app_access_check());

-- 13. store_credits
ALTER TABLE IF EXISTS store_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON store_credits;
DROP POLICY IF EXISTS select_policy ON store_credits;
DROP POLICY IF EXISTS insert_policy ON store_credits;
DROP POLICY IF EXISTS update_policy ON store_credits;
DROP POLICY IF EXISTS delete_policy ON store_credits;
CREATE POLICY select_policy ON store_credits FOR SELECT USING (true);
CREATE POLICY insert_policy ON store_credits FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON store_credits FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON store_credits FOR DELETE USING (app_access_check());

-- 14. support_tickets
ALTER TABLE IF EXISTS support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON support_tickets;
DROP POLICY IF EXISTS select_policy ON support_tickets;
DROP POLICY IF EXISTS insert_policy ON support_tickets;
DROP POLICY IF EXISTS update_policy ON support_tickets;
DROP POLICY IF EXISTS delete_policy ON support_tickets;
CREATE POLICY select_policy ON support_tickets FOR SELECT USING (true);
CREATE POLICY insert_policy ON support_tickets FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON support_tickets FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON support_tickets FOR DELETE USING (app_access_check());

-- 15. faqs
ALTER TABLE IF EXISTS faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON faqs;
DROP POLICY IF EXISTS select_policy ON faqs;
DROP POLICY IF EXISTS insert_policy ON faqs;
DROP POLICY IF EXISTS update_policy ON faqs;
DROP POLICY IF EXISTS delete_policy ON faqs;
CREATE POLICY select_policy ON faqs FOR SELECT USING (true);
CREATE POLICY insert_policy ON faqs FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON faqs FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON faqs FOR DELETE USING (app_access_check());

-- 16. policies
ALTER TABLE IF EXISTS policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON policies;
DROP POLICY IF EXISTS select_policy ON policies;
DROP POLICY IF EXISTS insert_policy ON policies;
DROP POLICY IF EXISTS update_policy ON policies;
DROP POLICY IF EXISTS delete_policy ON policies;
CREATE POLICY select_policy ON policies FOR SELECT USING (true);
CREATE POLICY insert_policy ON policies FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON policies FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON policies FOR DELETE USING (app_access_check());

-- 17. suppliers
ALTER TABLE IF EXISTS suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON suppliers;
DROP POLICY IF EXISTS select_policy ON suppliers;
DROP POLICY IF EXISTS insert_policy ON suppliers;
DROP POLICY IF EXISTS update_policy ON suppliers;
DROP POLICY IF EXISTS delete_policy ON suppliers;
CREATE POLICY select_policy ON suppliers FOR SELECT USING (true);
CREATE POLICY insert_policy ON suppliers FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON suppliers FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON suppliers FOR DELETE USING (app_access_check());

-- 18. notifications
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON notifications;
DROP POLICY IF EXISTS select_policy ON notifications;
DROP POLICY IF EXISTS insert_policy ON notifications;
DROP POLICY IF EXISTS update_policy ON notifications;
DROP POLICY IF EXISTS delete_policy ON notifications;
CREATE POLICY select_policy ON notifications FOR SELECT USING (true);
CREATE POLICY insert_policy ON notifications FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON notifications FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON notifications FOR DELETE USING (app_access_check());

-- 19. banners
ALTER TABLE IF EXISTS banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON banners;
DROP POLICY IF EXISTS select_policy ON banners;
DROP POLICY IF EXISTS insert_policy ON banners;
DROP POLICY IF EXISTS update_policy ON banners;
DROP POLICY IF EXISTS delete_policy ON banners;
CREATE POLICY select_policy ON banners FOR SELECT USING (true);
CREATE POLICY insert_policy ON banners FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON banners FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON banners FOR DELETE USING (app_access_check());

-- 20. announcements
ALTER TABLE IF EXISTS announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON announcements;
DROP POLICY IF EXISTS select_policy ON announcements;
DROP POLICY IF EXISTS insert_policy ON announcements;
DROP POLICY IF EXISTS update_policy ON announcements;
DROP POLICY IF EXISTS delete_policy ON announcements;
CREATE POLICY select_policy ON announcements FOR SELECT USING (true);
CREATE POLICY insert_policy ON announcements FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON announcements FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON announcements FOR DELETE USING (app_access_check());

-- 21. stock_adjustments
ALTER TABLE IF EXISTS stock_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON stock_adjustments;
DROP POLICY IF EXISTS select_policy ON stock_adjustments;
DROP POLICY IF EXISTS insert_policy ON stock_adjustments;
DROP POLICY IF EXISTS update_policy ON stock_adjustments;
DROP POLICY IF EXISTS delete_policy ON stock_adjustments;
CREATE POLICY select_policy ON stock_adjustments FOR SELECT USING (true);
CREATE POLICY insert_policy ON stock_adjustments FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON stock_adjustments FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON stock_adjustments FOR DELETE USING (app_access_check());

-- 22. device_history
ALTER TABLE IF EXISTS device_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON device_history;
DROP POLICY IF EXISTS select_policy ON device_history;
DROP POLICY IF EXISTS insert_policy ON device_history;
DROP POLICY IF EXISTS update_policy ON device_history;
DROP POLICY IF EXISTS delete_policy ON device_history;
CREATE POLICY select_policy ON device_history FOR SELECT USING (true);
CREATE POLICY insert_policy ON device_history FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON device_history FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON device_history FOR DELETE USING (app_access_check());

-- 23. activity_logs
ALTER TABLE IF EXISTS activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON activity_logs;
DROP POLICY IF EXISTS select_policy ON activity_logs;
DROP POLICY IF EXISTS insert_policy ON activity_logs;
DROP POLICY IF EXISTS update_policy ON activity_logs;
DROP POLICY IF EXISTS delete_policy ON activity_logs;
CREATE POLICY select_policy ON activity_logs FOR SELECT USING (true);
CREATE POLICY insert_policy ON activity_logs FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON activity_logs FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON activity_logs FOR DELETE USING (app_access_check());

-- 24. login_attempts
ALTER TABLE IF EXISTS login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON login_attempts;
DROP POLICY IF EXISTS select_policy ON login_attempts;
DROP POLICY IF EXISTS insert_policy ON login_attempts;
DROP POLICY IF EXISTS update_policy ON login_attempts;
DROP POLICY IF EXISTS delete_policy ON login_attempts;
CREATE POLICY select_policy ON login_attempts FOR SELECT USING (true);
CREATE POLICY insert_policy ON login_attempts FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON login_attempts FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON login_attempts FOR DELETE USING (app_access_check());

-- 25. permissions
ALTER TABLE IF EXISTS permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON permissions;
DROP POLICY IF EXISTS select_policy ON permissions;
DROP POLICY IF EXISTS insert_policy ON permissions;
DROP POLICY IF EXISTS update_policy ON permissions;
DROP POLICY IF EXISTS delete_policy ON permissions;
CREATE POLICY select_policy ON permissions FOR SELECT USING (true);
CREATE POLICY insert_policy ON permissions FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON permissions FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON permissions FOR DELETE USING (app_access_check());

-- 26. role_permissions
ALTER TABLE IF EXISTS role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON role_permissions;
DROP POLICY IF EXISTS select_policy ON role_permissions;
DROP POLICY IF EXISTS insert_policy ON role_permissions;
DROP POLICY IF EXISTS update_policy ON role_permissions;
DROP POLICY IF EXISTS delete_policy ON role_permissions;
CREATE POLICY select_policy ON role_permissions FOR SELECT USING (true);
CREATE POLICY insert_policy ON role_permissions FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON role_permissions FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON role_permissions FOR DELETE USING (app_access_check());

-- 27. user_permissions
ALTER TABLE IF EXISTS user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON user_permissions;
DROP POLICY IF EXISTS select_policy ON user_permissions;
DROP POLICY IF EXISTS insert_policy ON user_permissions;
DROP POLICY IF EXISTS update_policy ON user_permissions;
DROP POLICY IF EXISTS delete_policy ON user_permissions;
CREATE POLICY select_policy ON user_permissions FOR SELECT USING (true);
CREATE POLICY insert_policy ON user_permissions FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON user_permissions FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON user_permissions FOR DELETE USING (app_access_check());

-- 28. sessions
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON sessions;
DROP POLICY IF EXISTS select_policy ON sessions;
DROP POLICY IF EXISTS insert_policy ON sessions;
DROP POLICY IF EXISTS update_policy ON sessions;
DROP POLICY IF EXISTS delete_policy ON sessions;
CREATE POLICY select_policy ON sessions FOR SELECT USING (true);
CREATE POLICY insert_policy ON sessions FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON sessions FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON sessions FOR DELETE USING (app_access_check());

-- 29. wishlists
ALTER TABLE IF EXISTS wishlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON wishlists;
DROP POLICY IF EXISTS select_policy ON wishlists;
DROP POLICY IF EXISTS insert_policy ON wishlists;
DROP POLICY IF EXISTS update_policy ON wishlists;
DROP POLICY IF EXISTS delete_policy ON wishlists;
CREATE POLICY select_policy ON wishlists FOR SELECT USING (true);
CREATE POLICY insert_policy ON wishlists FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON wishlists FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON wishlists FOR DELETE USING (app_access_check());

-- 30. reviews
ALTER TABLE IF EXISTS reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON reviews;
DROP POLICY IF EXISTS select_policy ON reviews;
DROP POLICY IF EXISTS insert_policy ON reviews;
DROP POLICY IF EXISTS update_policy ON reviews;
DROP POLICY IF EXISTS delete_policy ON reviews;
CREATE POLICY select_policy ON reviews FOR SELECT USING (true);
CREATE POLICY insert_policy ON reviews FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON reviews FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON reviews FOR DELETE USING (app_access_check());

-- 31. discounts
ALTER TABLE IF EXISTS discounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON discounts;
DROP POLICY IF EXISTS select_policy ON discounts;
DROP POLICY IF EXISTS insert_policy ON discounts;
DROP POLICY IF EXISTS update_policy ON discounts;
DROP POLICY IF EXISTS delete_policy ON discounts;
CREATE POLICY select_policy ON discounts FOR SELECT USING (true);
CREATE POLICY insert_policy ON discounts FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON discounts FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON discounts FOR DELETE USING (app_access_check());

-- 32. shipping_rates
ALTER TABLE IF EXISTS shipping_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON shipping_rates;
DROP POLICY IF EXISTS select_policy ON shipping_rates;
DROP POLICY IF EXISTS insert_policy ON shipping_rates;
DROP POLICY IF EXISTS update_policy ON shipping_rates;
DROP POLICY IF EXISTS delete_policy ON shipping_rates;
CREATE POLICY select_policy ON shipping_rates FOR SELECT USING (true);
CREATE POLICY insert_policy ON shipping_rates FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON shipping_rates FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON shipping_rates FOR DELETE USING (app_access_check());

-- 33. system_settings
ALTER TABLE IF EXISTS system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON system_settings;
DROP POLICY IF EXISTS select_policy ON system_settings;
DROP POLICY IF EXISTS insert_policy ON system_settings;
DROP POLICY IF EXISTS update_policy ON system_settings;
DROP POLICY IF EXISTS delete_policy ON system_settings;
CREATE POLICY select_policy ON system_settings FOR SELECT USING (true);
CREATE POLICY insert_policy ON system_settings FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON system_settings FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON system_settings FOR DELETE USING (app_access_check());

-- 34. error_logs
ALTER TABLE IF EXISTS error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON error_logs;
DROP POLICY IF EXISTS select_policy ON error_logs;
DROP POLICY IF EXISTS insert_policy ON error_logs;
DROP POLICY IF EXISTS update_policy ON error_logs;
DROP POLICY IF EXISTS delete_policy ON error_logs;
CREATE POLICY select_policy ON error_logs FOR SELECT USING (true);
CREATE POLICY insert_policy ON error_logs FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON error_logs FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON error_logs FOR DELETE USING (app_access_check());

-- 35. backup_history
ALTER TABLE IF EXISTS backup_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON backup_history;
DROP POLICY IF EXISTS select_policy ON backup_history;
DROP POLICY IF EXISTS insert_policy ON backup_history;
DROP POLICY IF EXISTS update_policy ON backup_history;
DROP POLICY IF EXISTS delete_policy ON backup_history;
CREATE POLICY select_policy ON backup_history FOR SELECT USING (true);
CREATE POLICY insert_policy ON backup_history FOR INSERT WITH CHECK (app_access_check());
CREATE POLICY update_policy ON backup_history FOR UPDATE USING (app_access_check()) WITH CHECK (app_access_check());
CREATE POLICY delete_policy ON backup_history FOR DELETE USING (app_access_check());

-- Storage: review media uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-media', 'review-media', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS review_media_select_policy ON storage.objects;
DROP POLICY IF EXISTS review_media_insert_policy ON storage.objects;
DROP POLICY IF EXISTS review_media_update_policy ON storage.objects;
DROP POLICY IF EXISTS review_media_delete_policy ON storage.objects;

CREATE POLICY review_media_select_policy
ON storage.objects FOR SELECT
USING (bucket_id = 'review-media');

CREATE POLICY review_media_insert_policy
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'review-media'
  AND auth.role() = ANY (ARRAY['anon', 'authenticated', 'service_role'])
);

CREATE POLICY review_media_update_policy
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'review-media'
  AND auth.role() = ANY (ARRAY['anon', 'authenticated', 'service_role'])
)
WITH CHECK (
  bucket_id = 'review-media'
  AND auth.role() = ANY (ARRAY['anon', 'authenticated', 'service_role'])
);

CREATE POLICY review_media_delete_policy
ON storage.objects FOR DELETE
USING (
  bucket_id = 'review-media'
  AND auth.role() = ANY (ARRAY['anon', 'authenticated', 'service_role'])
);

-- ==================== SEED DATA ====================

-- Users (4 accounts — one per role)
-- Passwords: super_admin/owner = Admin@123 | store_staff = Staff@123 | customer = Customer@123
INSERT INTO users (name, email, password_hash, role, phone, is_active, email_verified)
VALUES
  ('Super Admin',  'superadmin@10thwest.com', '$2a$10$JtLXG42.S1CXFiyoKjO8yOm7FO2tjMse.gkkYdX7KOFl1mRVNpItq', 'super_admin',  '555-0001', TRUE, TRUE),
  ('Store Owner',  'owner@10thwest.com',      '$2a$10$JtLXG42.S1CXFiyoKjO8yOm7FO2tjMse.gkkYdX7KOFl1mRVNpItq', 'owner',        '555-0002', TRUE, TRUE),
  ('Store Staff',  'staff@10thwest.com',      '$2a$10$GdWFrM9MOq9M1/vDwLpn/OStcKQ8jPvxARatiI/mb4plJ2Q7IcDdi', 'store_staff',  '555-0003', TRUE, TRUE),
  ('Moto Rider',   'customer@10thwest.com',   '$2a$10$nBXvGl8qIrwE7cZcQJz/6.2S2uRx5ZcU.Cst3f6ZdxZd2G0WlPg/G', 'customer',     '555-0004', TRUE, TRUE)
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active,
    email_verified = EXCLUDED.email_verified;

-- Categories
INSERT INTO categories (name) VALUES
  ('NMAX V1'), ('NMAX V2'), ('AEROX V1'), ('AEROX V2'),
  ('M3 MIO'), ('CLICK 150'), ('CLICK 125'), ('BEAT V2'), ('Universal Parts')
ON CONFLICT (name) DO NOTHING;

-- Products
INSERT INTO products (
  part_number, name, description, price, buying_price, image,
  category_id, stock_quantity, box_number, low_stock_threshold, brand, sku, barcode
) VALUES
  ('2DP-H2129-00',     'Battery Cover',                'Original Yamaha Battery Cover for NMAX V1.',  150.00, 104.00, 'https://images.unsplash.com/photo-1558564175-99645903c7bb?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='NMAX V1'),         2,  '2F STAIRS', 2,  'Yamaha', 'SKU-001', '123456789012'),
  ('2DP-F8351-00-P1',  'Body Cowling Pearl White (46)', 'Side body cowling in Pearl White finish.',    800.00, 448.00, 'https://images.unsplash.com/photo-1598616345941-86560965a3d7?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='NMAX V1'),         4,  '46',        3,  'Yamaha', 'SKU-002', '123456789013'),
  ('2DP-F8351-00-P5',  'Body Cowling Matte Red (37)',   'Side body cowling in Matte Red finish.',      600.00, 560.00, 'https://images.unsplash.com/photo-1578844251758-2f71da645217?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='NMAX V1'),         7,  '37',        3,  'Yamaha', 'SKU-003', '123456789014'),
  ('2DP-E4412-00',     'Cap Cleaner Case Outer',        'Outer casing for air cleaner.',               500.00, 343.00, 'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='NMAX V1'),         5,  '2F STAIRS', 2,  'Yamaha', 'SKU-004', '123456789015'),
  ('2DP-F2865-00-P7',  'Cover Front Matte Black (43)',  'Front cover panel matte black.',              700.00, 509.00, 'https://images.unsplash.com/photo-1622185135505-2d795043906a?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='NMAX V1'),         6,  '43',        3,  'Yamaha', 'SKU-005', '123456789016'),
  ('UNIV-OIL-1040',   'Motul 7100 4T 10W-40',         '100% synthetic 4-stroke lubricant.',           650.00, 450.00, 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&q=80&w=400', (SELECT id FROM categories WHERE name='Universal Parts'), 45, 'SHELF A1',  10, 'Motul',  'SKU-006', '123456789017')
ON CONFLICT (sku) DO NOTHING;

-- Permissions (18 granular permissions)
INSERT INTO permissions (name, description, category) VALUES
  ('products.view',    'View products',        'Products'),
  ('products.create',  'Create products',      'Products'),
  ('products.edit',    'Edit products',        'Products'),
  ('products.delete',  'Delete products',      'Products'),
  ('orders.view',      'View orders',          'Orders'),
  ('orders.edit',      'Edit order status',    'Orders'),
  ('orders.refund',    'Process refunds',      'Orders'),
  ('customers.view',   'View customers',       'Customers'),
  ('customers.edit',   'Edit customers',       'Customers'),
  ('reports.view',     'View reports',         'Reports'),
  ('staff.view',       'View staff',           'Staff'),
  ('staff.manage',     'Manage staff',         'Staff'),
  ('settings.manage',  'Manage settings',      'Settings'),
  ('pos.access',       'Access POS terminal',  'POS'),
  ('returns.view',     'View returns',         'Returns'),
  ('returns.process',  'Process returns',      'Returns'),
  ('inventory.view',   'View inventory',       'Inventory'),
  ('inventory.manage', 'Manage inventory',     'Inventory')
ON CONFLICT (name) DO NOTHING;

-- Role Permissions: Super Admin (ALL - bypasses checks, but seed for completeness)
INSERT INTO role_permissions (role, permission_id)
SELECT 'super_admin', id FROM permissions ON CONFLICT DO NOTHING;

-- Role Permissions: Owner (ALL - business manager)
INSERT INTO role_permissions (role, permission_id)
SELECT 'owner', id FROM permissions ON CONFLICT DO NOTHING;

-- Role Permissions: Store Staff (POS + inventory + orders + returns)
INSERT INTO role_permissions (role, permission_id)
SELECT 'store_staff', id FROM permissions
WHERE name IN ('products.view','orders.view','orders.edit','pos.access','returns.view','returns.process','customers.view','inventory.view','inventory.manage')
ON CONFLICT DO NOTHING;

-- Note: customer has no role_permissions (uses public features only)

-- Policies
INSERT INTO policies (type, title, content) VALUES
  ('return_policy',    'Return & Exchange Policy', '<h2>Return Policy</h2><p>We accept returns within 30 days of purchase. Items must be in original condition.</p>'),
  ('shipping_policy',  'Shipping Policy',          '<h2>Shipping Information</h2><p>Standard 3-5 business days. Shipping cost is calculated at checkout.</p>'),
  ('privacy_policy',   'Privacy Policy',            '<h2>Privacy Policy</h2><p>We collect and protect your personal information. We do not sell your data.</p>'),
  ('terms_of_service', 'Terms of Service',          '<h2>Terms of Service</h2><p>By using our service you agree to these terms.</p>')
ON CONFLICT (type) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;

-- FAQs
INSERT INTO faqs (question, answer, is_active, display_order)
SELECT v.question, v.answer, v.is_active, v.display_order
FROM (VALUES
  ('What is your return policy?',          'We accept returns within 30 days of purchase for most items. Items must be in original condition with all packaging.', TRUE, 1),
  ('How long does shipping take?',         'Standard shipping typically takes 3-5 business days. Expedited shipping options are available at checkout.', TRUE, 2),
  ('How can I track my order?',            'You can track your order by logging into your account and viewing your order history.', TRUE, 3),
  ('What payment methods do you accept?',  'We accept major cards, online payments, in-store cash, and store credit.', TRUE, 4)
) AS v(question, answer, is_active, display_order)
WHERE NOT EXISTS (SELECT 1 FROM faqs f WHERE f.question = v.question);

-- System Settings (37 config values)
INSERT INTO system_settings (category, key, value) VALUES
  ('security', 'max_login_attempts',         '5'),
  ('security', 'lockout_duration_minutes',    '15'),
  ('security', 'password_min_length',         '8'),
  ('security', 'password_require_uppercase',  'true'),
  ('security', 'password_require_lowercase',  'true'),
  ('security', 'password_require_number',     'true'),
  ('security', 'password_require_special',    'true'),
  ('security', 'session_timeout_minutes',     '30'),
  ('security', '2fa_enforcement',             'optional'),
  ('home',     'announcements_enabled',       'true'),
  ('store',    'name',     '10th West Moto'),
  ('store',    'tagline',  'Motorcycle Parts & Accessories'),
  ('store',    'email',    'admin@10thwestmoto.com'),
  ('store',    'phone',    '+63 XXX XXX XXXX'),
  ('store',    'address',  'Manila, Philippines'),
  ('store',    'currency', 'PHP'),
  ('store',    'timezone', 'Asia/Manila'),
  ('store',    'logo_url', ''),
  ('tax',      'enabled',   'true'),
  ('tax',      'rate',      '12'),
  ('tax',      'name',      'VAT'),
  ('tax',      'inclusive',  'true'),
  ('shipping', 'free_threshold', '3000'),
  ('shipping', 'flat_rate',      '150'),
  ('shipping', 'express_rate',   '350'),
  ('shipping', 'enable_pickup',  'true'),
  ('payment',  'cash_enabled',  'true'),
  ('payment',  'card_enabled',  'true'),
  ('payment',  'gcash_enabled', 'false'),
  ('payment',  'maya_enabled',  'false'),
  ('payment',  'stripe_pk',    ''),
  ('payment',  'stripe_sk',    ''),
  ('email',    'order_confirmation', 'true'),
  ('email',    'shipping_update',    'true'),
  ('email',    'return_approval',    'true'),
  ('email',    'promotions',         'false'),
  ('email',    'from_name',          '10th West Moto'),
  ('email',    'from_email',         'noreply@10thwestmoto.com')
ON CONFLICT (category, key) DO NOTHING;

-- Shipping Rates
INSERT INTO shipping_rates (method, label, base_fee, min_purchase_free, estimated_days, is_active)
SELECT v.method, v.label, v.base_fee, v.min_purchase_free, v.estimated_days, v.is_active
FROM (VALUES
  ('standard', 'Standard Shipping', 150.00, 3000.00, '3-5 business days', TRUE),
  ('express',  'Express Shipping',  350.00, NULL,     '1-2 business days', TRUE),
  ('pickup',   'Store Pickup',      0.00,   NULL,     'Same day',          TRUE)
) AS v(method, label, base_fee, min_purchase_free, estimated_days, is_active)
WHERE NOT EXISTS (SELECT 1 FROM shipping_rates sr WHERE sr.method = v.method);

COMMIT;

-- End of supabase-setup.sql
