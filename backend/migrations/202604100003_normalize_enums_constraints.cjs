const USER_ROLES = ['customer', 'admin', 'cashier', 'super_admin', 'owner', 'store_staff'];
const PRODUCT_STATUSES = ['draft', 'published'];
const PRODUCT_SHIPPING_OPTIONS = ['standard', 'express'];
const ORDER_STATUSES = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'completed', 'cancelled'];
const ORDER_SOURCES = ['online', 'pos'];
const ORDER_PAYMENT_METHODS = ['cash', 'card', 'cod', 'online', 'stripe', 'gcash', 'maya', 'bank_transfer'];
const ORDER_SHIPPING_METHODS = ['standard', 'express', 'pickup'];
const RETURN_STATUSES = ['pending', 'approved', 'rejected', 'refunded', 'exchanged'];
const RETURN_TYPES = ['online', 'in-store'];
const REFUND_METHODS = ['original', 'store_credit'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const STOCK_ADJUSTMENT_STATUSES = ['pending', 'approved', 'rejected'];
const STOCK_ADJUSTMENT_REASONS = [
  'restock',
  'damaged',
  'returned',
  'lost',
  'correction',
  'shrinkage',
  'transfer',
  'received',
  'expired',
  'other',
];
const DISCOUNT_TYPES = ['percentage', 'fixed'];

const toSqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
const toSqlList = (values) => values.map(toSqlLiteral).join(', ');

async function createEnumType(knex, typeName, values) {
  const sqlValues = toSqlList(values);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN
        EXECUTE 'CREATE TYPE ${typeName} AS ENUM (${sqlValues})';
      END IF;
    END $$;
  `);
}

async function normalizeData(knex) {
  await knex.raw(`
    ALTER TABLE IF EXISTS reviews
      ADD COLUMN IF NOT EXISTS review_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS moderated_by INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS moderation_note TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    UPDATE users
    SET role = CASE
      WHEN role IS NULL OR btrim(role) = '' THEN 'customer'
      WHEN lower(btrim(role)) IN ('superadmin', 'super-admin', 'super admin') THEN 'super_admin'
      WHEN lower(btrim(role)) IN ('store staff', 'store-staff', 'storestaff', 'staff', 'staff_member', 'staffmember', 'manager') THEN 'store_staff'
      WHEN lower(btrim(role)) IN ('administrator') THEN 'admin'
      ELSE lower(btrim(role))
    END;

    UPDATE users
    SET role = 'customer'
    WHERE role IS NULL OR role NOT IN (${toSqlList(USER_ROLES)});

    UPDATE role_permissions
    SET role = CASE
      WHEN role IS NULL OR btrim(role) = '' THEN 'customer'
      WHEN lower(btrim(role)) IN ('superadmin', 'super-admin', 'super admin') THEN 'super_admin'
      WHEN lower(btrim(role)) IN ('store staff', 'store-staff', 'storestaff', 'staff', 'staff_member', 'staffmember', 'manager') THEN 'store_staff'
      WHEN lower(btrim(role)) IN ('administrator') THEN 'admin'
      ELSE lower(btrim(role))
    END;

    UPDATE role_permissions
    SET role = 'customer'
    WHERE role IS NULL OR role NOT IN (${toSqlList(USER_ROLES)});

    UPDATE products
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'draft'
      WHEN lower(btrim(status)) IN ('available', 'out_of_stock', 'active', 'published') THEN 'published'
      WHEN lower(btrim(status)) IN ('hidden', 'inactive', 'draft') THEN 'draft'
      ELSE 'draft'
    END;

    UPDATE products
    SET shipping_option = CASE
      WHEN shipping_option IS NULL OR btrim(shipping_option) = '' THEN 'standard'
      WHEN lower(btrim(shipping_option)) IN ('express') THEN 'express'
      ELSE 'standard'
    END;

    UPDATE orders
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'pending'
      WHEN lower(btrim(status)) IN ('pending', 'awaiting_payment', 'payment_pending') THEN 'pending'
      WHEN lower(btrim(status)) IN ('paid', 'payment_received') THEN 'paid'
      WHEN lower(btrim(status)) IN ('preparing', 'processing', 'in_progress', 'in progress') THEN 'preparing'
      WHEN lower(btrim(status)) IN ('shipped', 'out_for_delivery', 'out for delivery', 'on_delivery') THEN 'shipped'
      WHEN lower(btrim(status)) IN ('delivered', 'received') THEN 'delivered'
      WHEN lower(btrim(status)) IN ('completed', 'complete', 'done') THEN 'completed'
      WHEN lower(btrim(status)) IN ('cancelled', 'canceled') THEN 'cancelled'
      ELSE 'pending'
    END;

    UPDATE orders
    SET source = CASE
      WHEN source IS NULL OR btrim(source) = '' THEN 'online'
      WHEN lower(btrim(source)) IN ('pos', 'in_store', 'in-store', 'in store', 'store', 'offline', 'walkin', 'walk-in') THEN 'pos'
      ELSE 'online'
    END;

    UPDATE orders
    SET payment_method = CASE
      WHEN payment_method IS NULL OR btrim(payment_method) = '' THEN NULL
      WHEN lower(btrim(payment_method)) IN ('cash') THEN 'cash'
      WHEN lower(btrim(payment_method)) IN ('card', 'credit_card', 'credit card', 'debit_card', 'debit card') THEN 'card'
      WHEN lower(btrim(payment_method)) IN ('cod', 'cash_on_delivery', 'cash on delivery') THEN 'cod'
      WHEN lower(btrim(payment_method)) IN ('online') THEN 'online'
      WHEN lower(btrim(payment_method)) IN ('stripe') THEN 'stripe'
      WHEN lower(btrim(payment_method)) IN ('gcash') THEN 'gcash'
      WHEN lower(btrim(payment_method)) IN ('maya') THEN 'maya'
      WHEN lower(btrim(payment_method)) IN ('bank_transfer', 'bank transfer', 'banktransfer') THEN 'bank_transfer'
      WHEN source = 'pos' THEN 'cash'
      ELSE 'online'
    END;

    UPDATE orders
    SET shipping_method = CASE
      WHEN shipping_method IS NULL OR btrim(shipping_method) = '' THEN 'standard'
      WHEN lower(btrim(shipping_method)) IN ('standard') THEN 'standard'
      WHEN lower(btrim(shipping_method)) IN ('express') THEN 'express'
      WHEN lower(btrim(shipping_method)) IN ('pickup', 'pick_up', 'pick-up') THEN 'pickup'
      ELSE 'standard'
    END;

    UPDATE returns
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'pending'
      WHEN lower(btrim(status)) IN ('pending', 'approved', 'rejected', 'refunded', 'exchanged') THEN lower(btrim(status))
      ELSE 'pending'
    END;

    UPDATE returns
    SET return_type = CASE
      WHEN return_type IS NULL OR btrim(return_type) = '' THEN 'online'
      WHEN lower(btrim(return_type)) IN ('in-store', 'in_store', 'in store', 'instore', 'walkin', 'walk-in') THEN 'in-store'
      ELSE 'online'
    END;

    UPDATE refunds
    SET method = CASE
      WHEN method IS NULL OR btrim(method) = '' THEN 'original'
      WHEN lower(btrim(method)) IN ('store_credit', 'store-credit', 'store credit') THEN 'store_credit'
      ELSE 'original'
    END;

    UPDATE reviews
    SET review_status = CASE
      WHEN review_status IS NULL OR btrim(review_status) = '' THEN
        CASE WHEN COALESCE(is_approved, false) = true THEN 'approved' ELSE 'pending' END
      WHEN lower(btrim(review_status)) IN ('approved', 'accept', 'accepted') THEN 'approved'
      WHEN lower(btrim(review_status)) IN ('rejected', 'reject', 'declined') THEN 'rejected'
      ELSE 'pending'
    END;

    UPDATE reviews
    SET is_approved = CASE
      WHEN review_status = 'approved' THEN true
      ELSE false
    END;

    UPDATE support_tickets
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'open'
      WHEN lower(btrim(status)) IN ('open') THEN 'open'
      WHEN lower(btrim(status)) IN ('in_progress', 'in progress', 'processing') THEN 'in_progress'
      WHEN lower(btrim(status)) IN ('resolved') THEN 'resolved'
      WHEN lower(btrim(status)) IN ('closed') THEN 'closed'
      ELSE 'open'
    END;

    UPDATE stock_adjustments
    SET status = CASE
      WHEN status IS NULL OR btrim(status) = '' THEN 'pending'
      WHEN lower(btrim(status)) IN ('pending', 'approved', 'rejected') THEN lower(btrim(status))
      ELSE 'pending'
    END;

    UPDATE stock_adjustments
    SET reason = CASE
      WHEN reason IS NULL OR btrim(reason) = '' THEN NULL
      WHEN lower(btrim(reason)) IN ('restock', 'damaged', 'returned', 'lost', 'correction', 'shrinkage', 'transfer', 'received', 'expired', 'other') THEN lower(btrim(reason))
      WHEN lower(btrim(reason)) IN ('manual') THEN 'correction'
      ELSE 'correction'
    END;

    UPDATE discounts
    SET type = CASE
      WHEN type IS NULL OR btrim(type) = '' THEN NULL
      WHEN lower(btrim(type)) IN ('percentage', 'percent', '%') THEN 'percentage'
      WHEN lower(btrim(type)) IN ('fixed', 'fixed_amount', 'fixed amount') THEN 'fixed'
      ELSE NULL
    END;

    UPDATE carts
    SET session_id = CONCAT('legacy-cart-', id)
    WHERE user_id IS NULL AND (session_id IS NULL OR btrim(session_id) = '');

    UPDATE carts
    SET session_id = NULL
    WHERE user_id IS NOT NULL AND session_id IS NOT NULL;
  `);
}

async function convertColumnsToEnums(knex) {
  await knex.raw(`
    ALTER TABLE users
      ALTER COLUMN role TYPE user_role_enum USING role::user_role_enum,
      ALTER COLUMN role SET DEFAULT 'customer'::user_role_enum,
      ALTER COLUMN role SET NOT NULL;

    ALTER TABLE role_permissions
      ALTER COLUMN role TYPE user_role_enum USING role::user_role_enum;

    ALTER TABLE products
      ALTER COLUMN status TYPE product_status_enum USING status::product_status_enum,
      ALTER COLUMN status SET DEFAULT 'draft'::product_status_enum,
      ALTER COLUMN shipping_option TYPE product_shipping_option_enum USING shipping_option::product_shipping_option_enum,
      ALTER COLUMN shipping_option SET DEFAULT 'standard'::product_shipping_option_enum;

    ALTER TABLE orders
      ALTER COLUMN status TYPE order_status_enum USING status::order_status_enum,
      ALTER COLUMN status SET DEFAULT 'pending'::order_status_enum,
      ALTER COLUMN source TYPE order_source_enum USING source::order_source_enum,
      ALTER COLUMN source SET DEFAULT 'online'::order_source_enum,
      ALTER COLUMN payment_method TYPE order_payment_method_enum USING payment_method::order_payment_method_enum,
      ALTER COLUMN shipping_method TYPE order_shipping_method_enum USING shipping_method::order_shipping_method_enum,
      ALTER COLUMN shipping_method SET DEFAULT 'standard'::order_shipping_method_enum;

    ALTER TABLE returns
      ALTER COLUMN status TYPE return_status_enum USING status::return_status_enum,
      ALTER COLUMN status SET DEFAULT 'pending'::return_status_enum,
      ALTER COLUMN return_type TYPE return_type_enum USING return_type::return_type_enum,
      ALTER COLUMN return_type SET DEFAULT 'online'::return_type_enum;

    ALTER TABLE refunds
      ALTER COLUMN method TYPE refund_method_enum USING method::refund_method_enum,
      ALTER COLUMN method SET DEFAULT 'original'::refund_method_enum;

    ALTER TABLE reviews
      ALTER COLUMN review_status TYPE review_status_enum USING review_status::review_status_enum,
      ALTER COLUMN review_status SET DEFAULT 'pending'::review_status_enum,
      ALTER COLUMN review_status SET NOT NULL;

    ALTER TABLE support_tickets
      ALTER COLUMN status TYPE support_ticket_status_enum USING status::support_ticket_status_enum,
      ALTER COLUMN status SET DEFAULT 'open'::support_ticket_status_enum;

    ALTER TABLE stock_adjustments
      ALTER COLUMN reason TYPE stock_adjustment_reason_enum USING reason::stock_adjustment_reason_enum,
      ALTER COLUMN status TYPE stock_adjustment_status_enum USING status::stock_adjustment_status_enum,
      ALTER COLUMN status SET DEFAULT 'pending'::stock_adjustment_status_enum;

    ALTER TABLE discounts
      ALTER COLUMN type TYPE discount_type_enum USING type::discount_type_enum;
  `);
}

async function applyCheckConstraints(knex) {
  await knex.raw(`
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_price_positive_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_price_positive_check
      CHECK (price > 0) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_stock_quantity_non_negative_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_stock_quantity_non_negative_check
      CHECK (stock_quantity >= 0) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_low_stock_threshold_non_negative_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_low_stock_threshold_non_negative_check
      CHECK (low_stock_threshold >= 0) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_buying_price_non_negative_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_buying_price_non_negative_check
      CHECK (buying_price IS NULL OR buying_price >= 0) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_sale_price_bounds_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_sale_price_bounds_check
      CHECK (sale_price IS NULL OR (sale_price > 0 AND sale_price <= price)) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_shipping_weight_positive_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_shipping_weight_positive_check
      CHECK (shipping_weight_kg IS NULL OR shipping_weight_kg > 0) NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_image_urls_array_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_image_urls_array_check
      CHECK (image_urls IS NULL OR jsonb_typeof(image_urls) = 'array') NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_bulk_pricing_array_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_bulk_pricing_array_check
      CHECK (bulk_pricing IS NULL OR jsonb_typeof(bulk_pricing) = 'array') NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_variant_options_array_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_variant_options_array_check
      CHECK (variant_options IS NULL OR jsonb_typeof(variant_options) = 'array') NOT VALID;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_shipping_dimensions_object_check;
    ALTER TABLE IF EXISTS products ADD CONSTRAINT products_shipping_dimensions_object_check
      CHECK (shipping_dimensions IS NULL OR jsonb_typeof(shipping_dimensions) = 'object') NOT VALID;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_total_amount_positive_check;
    ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_total_amount_positive_check
      CHECK (total_amount > 0) NOT VALID;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_discount_amount_non_negative_check;
    ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_discount_amount_non_negative_check
      CHECK (discount_amount >= 0) NOT VALID;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_tax_amount_non_negative_check;
    ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_tax_amount_non_negative_check
      CHECK (tax_amount >= 0) NOT VALID;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_amount_tendered_non_negative_check;
    ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_amount_tendered_non_negative_check
      CHECK (amount_tendered IS NULL OR amount_tendered >= 0) NOT VALID;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_change_due_non_negative_check;
    ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_change_due_non_negative_check
      CHECK (change_due IS NULL OR change_due >= 0) NOT VALID;

    ALTER TABLE IF EXISTS order_items DROP CONSTRAINT IF EXISTS order_items_quantity_positive_check;
    ALTER TABLE IF EXISTS order_items ADD CONSTRAINT order_items_quantity_positive_check
      CHECK (quantity > 0) NOT VALID;

    ALTER TABLE IF EXISTS order_items DROP CONSTRAINT IF EXISTS order_items_product_price_non_negative_check;
    ALTER TABLE IF EXISTS order_items ADD CONSTRAINT order_items_product_price_non_negative_check
      CHECK (product_price >= 0) NOT VALID;

    ALTER TABLE IF EXISTS returns DROP CONSTRAINT IF EXISTS returns_refund_amount_non_negative_check;
    ALTER TABLE IF EXISTS returns ADD CONSTRAINT returns_refund_amount_non_negative_check
      CHECK (refund_amount >= 0) NOT VALID;

    ALTER TABLE IF EXISTS returns DROP CONSTRAINT IF EXISTS returns_items_json_array_check;
    ALTER TABLE IF EXISTS returns ADD CONSTRAINT returns_items_json_array_check
      CHECK (jsonb_typeof(items) = 'array') NOT VALID;

    ALTER TABLE IF EXISTS refunds DROP CONSTRAINT IF EXISTS refunds_amount_non_negative_check;
    ALTER TABLE IF EXISTS refunds ADD CONSTRAINT refunds_amount_non_negative_check
      CHECK (amount >= 0) NOT VALID;

    ALTER TABLE IF EXISTS shipping_rates DROP CONSTRAINT IF EXISTS shipping_rates_base_fee_non_negative_check;
    ALTER TABLE IF EXISTS shipping_rates ADD CONSTRAINT shipping_rates_base_fee_non_negative_check
      CHECK (base_fee >= 0) NOT VALID;

    ALTER TABLE IF EXISTS shipping_rates DROP CONSTRAINT IF EXISTS shipping_rates_min_purchase_free_non_negative_check;
    ALTER TABLE IF EXISTS shipping_rates ADD CONSTRAINT shipping_rates_min_purchase_free_non_negative_check
      CHECK (min_purchase_free IS NULL OR min_purchase_free >= 0) NOT VALID;

    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_value_positive_check;
    ALTER TABLE IF EXISTS discounts ADD CONSTRAINT discounts_value_positive_check
      CHECK (value > 0) NOT VALID;

    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_min_purchase_non_negative_check;
    ALTER TABLE IF EXISTS discounts ADD CONSTRAINT discounts_min_purchase_non_negative_check
      CHECK (min_purchase >= 0) NOT VALID;

    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_used_count_non_negative_check;
    ALTER TABLE IF EXISTS discounts ADD CONSTRAINT discounts_used_count_non_negative_check
      CHECK (used_count >= 0) NOT VALID;

    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_max_uses_positive_check;
    ALTER TABLE IF EXISTS discounts ADD CONSTRAINT discounts_max_uses_positive_check
      CHECK (max_uses IS NULL OR max_uses > 0) NOT VALID;

    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_rating_range_check;
    ALTER TABLE IF EXISTS reviews ADD CONSTRAINT reviews_rating_range_check
      CHECK (rating BETWEEN 1 AND 5) NOT VALID;

    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_media_urls_array_check;
    ALTER TABLE IF EXISTS reviews ADD CONSTRAINT reviews_media_urls_array_check
      CHECK (media_urls IS NULL OR jsonb_typeof(media_urls) = 'array') NOT VALID;

    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_status_approval_consistency_check;
    ALTER TABLE IF EXISTS reviews ADD CONSTRAINT reviews_status_approval_consistency_check
      CHECK (
        (review_status = 'approved' AND is_approved = true)
        OR (review_status IN ('pending', 'rejected') AND is_approved = false)
      ) NOT VALID;

    ALTER TABLE IF EXISTS carts DROP CONSTRAINT IF EXISTS carts_exactly_one_owner_check;
    ALTER TABLE IF EXISTS carts ADD CONSTRAINT carts_exactly_one_owner_check
      CHECK (((user_id IS NOT NULL)::int + (session_id IS NOT NULL)::int) = 1) NOT VALID;
  `);
}

exports.up = async function up(knex) {
  await createEnumType(knex, 'user_role_enum', USER_ROLES);
  await createEnumType(knex, 'product_status_enum', PRODUCT_STATUSES);
  await createEnumType(knex, 'product_shipping_option_enum', PRODUCT_SHIPPING_OPTIONS);
  await createEnumType(knex, 'order_status_enum', ORDER_STATUSES);
  await createEnumType(knex, 'order_source_enum', ORDER_SOURCES);
  await createEnumType(knex, 'order_payment_method_enum', ORDER_PAYMENT_METHODS);
  await createEnumType(knex, 'order_shipping_method_enum', ORDER_SHIPPING_METHODS);
  await createEnumType(knex, 'return_status_enum', RETURN_STATUSES);
  await createEnumType(knex, 'return_type_enum', RETURN_TYPES);
  await createEnumType(knex, 'refund_method_enum', REFUND_METHODS);
  await createEnumType(knex, 'review_status_enum', REVIEW_STATUSES);
  await createEnumType(knex, 'support_ticket_status_enum', SUPPORT_TICKET_STATUSES);
  await createEnumType(knex, 'stock_adjustment_status_enum', STOCK_ADJUSTMENT_STATUSES);
  await createEnumType(knex, 'stock_adjustment_reason_enum', STOCK_ADJUSTMENT_REASONS);
  await createEnumType(knex, 'discount_type_enum', DISCOUNT_TYPES);

  await normalizeData(knex);
  await convertColumnsToEnums(knex);
  await applyCheckConstraints(knex);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE IF EXISTS carts DROP CONSTRAINT IF EXISTS carts_exactly_one_owner_check;

    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_status_approval_consistency_check;
    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_media_urls_array_check;
    ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_rating_range_check;

    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_max_uses_positive_check;
    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_used_count_non_negative_check;
    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_min_purchase_non_negative_check;
    ALTER TABLE IF EXISTS discounts DROP CONSTRAINT IF EXISTS discounts_value_positive_check;

    ALTER TABLE IF EXISTS shipping_rates DROP CONSTRAINT IF EXISTS shipping_rates_min_purchase_free_non_negative_check;
    ALTER TABLE IF EXISTS shipping_rates DROP CONSTRAINT IF EXISTS shipping_rates_base_fee_non_negative_check;

    ALTER TABLE IF EXISTS refunds DROP CONSTRAINT IF EXISTS refunds_amount_non_negative_check;

    ALTER TABLE IF EXISTS returns DROP CONSTRAINT IF EXISTS returns_items_json_array_check;
    ALTER TABLE IF EXISTS returns DROP CONSTRAINT IF EXISTS returns_refund_amount_non_negative_check;

    ALTER TABLE IF EXISTS order_items DROP CONSTRAINT IF EXISTS order_items_product_price_non_negative_check;
    ALTER TABLE IF EXISTS order_items DROP CONSTRAINT IF EXISTS order_items_quantity_positive_check;

    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_change_due_non_negative_check;
    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_amount_tendered_non_negative_check;
    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_tax_amount_non_negative_check;
    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_discount_amount_non_negative_check;
    ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_total_amount_positive_check;

    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_shipping_dimensions_object_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_variant_options_array_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_bulk_pricing_array_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_image_urls_array_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_shipping_weight_positive_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_sale_price_bounds_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_buying_price_non_negative_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_low_stock_threshold_non_negative_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_stock_quantity_non_negative_check;
    ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_price_positive_check;

    ALTER TABLE IF EXISTS users
      ALTER COLUMN role TYPE VARCHAR(50) USING role::text,
      ALTER COLUMN role SET DEFAULT 'customer';

    ALTER TABLE IF EXISTS role_permissions
      ALTER COLUMN role TYPE VARCHAR(50) USING role::text;

    ALTER TABLE IF EXISTS products
      ALTER COLUMN status TYPE VARCHAR(20) USING status::text,
      ALTER COLUMN status SET DEFAULT 'draft',
      ALTER COLUMN shipping_option TYPE VARCHAR(20) USING shipping_option::text,
      ALTER COLUMN shipping_option SET DEFAULT 'standard';

    ALTER TABLE IF EXISTS orders
      ALTER COLUMN status TYPE VARCHAR(50) USING status::text,
      ALTER COLUMN status SET DEFAULT 'pending',
      ALTER COLUMN source TYPE VARCHAR(20) USING source::text,
      ALTER COLUMN source SET DEFAULT 'online',
      ALTER COLUMN payment_method TYPE VARCHAR(20) USING payment_method::text,
      ALTER COLUMN shipping_method TYPE VARCHAR(50) USING shipping_method::text,
      ALTER COLUMN shipping_method SET DEFAULT 'standard';

    ALTER TABLE IF EXISTS returns
      ALTER COLUMN status TYPE VARCHAR(50) USING status::text,
      ALTER COLUMN status SET DEFAULT 'pending',
      ALTER COLUMN return_type TYPE VARCHAR(20) USING return_type::text,
      ALTER COLUMN return_type SET DEFAULT 'online';

    ALTER TABLE IF EXISTS refunds
      ALTER COLUMN method TYPE VARCHAR(50) USING method::text,
      ALTER COLUMN method SET DEFAULT 'original';

    ALTER TABLE IF EXISTS reviews
      ALTER COLUMN review_status TYPE VARCHAR(20) USING review_status::text,
      ALTER COLUMN review_status SET DEFAULT 'pending';

    ALTER TABLE IF EXISTS support_tickets
      ALTER COLUMN status TYPE VARCHAR(50) USING status::text,
      ALTER COLUMN status SET DEFAULT 'open';

    ALTER TABLE IF EXISTS stock_adjustments
      ALTER COLUMN reason TYPE VARCHAR(50) USING reason::text,
      ALTER COLUMN status TYPE VARCHAR(20) USING status::text,
      ALTER COLUMN status SET DEFAULT 'pending';

    ALTER TABLE IF EXISTS discounts
      ALTER COLUMN type TYPE VARCHAR(20) USING type::text;

    DROP TYPE IF EXISTS discount_type_enum;
    DROP TYPE IF EXISTS stock_adjustment_reason_enum;
    DROP TYPE IF EXISTS stock_adjustment_status_enum;
    DROP TYPE IF EXISTS support_ticket_status_enum;
    DROP TYPE IF EXISTS review_status_enum;
    DROP TYPE IF EXISTS refund_method_enum;
    DROP TYPE IF EXISTS return_type_enum;
    DROP TYPE IF EXISTS return_status_enum;
    DROP TYPE IF EXISTS order_shipping_method_enum;
    DROP TYPE IF EXISTS order_payment_method_enum;
    DROP TYPE IF EXISTS order_source_enum;
    DROP TYPE IF EXISTS order_status_enum;
    DROP TYPE IF EXISTS product_shipping_option_enum;
    DROP TYPE IF EXISTS product_status_enum;
    DROP TYPE IF EXISTS user_role_enum;
  `);
};
