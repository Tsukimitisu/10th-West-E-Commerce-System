exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE products SET
      store_selling_price = GREATEST(0, COALESCE(store_selling_price, price, 0)),
      buying_price = GREATEST(0, COALESCE(buying_price, 0)),
      stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0)),
      low_stock_threshold = GREATEST(0, COALESCE(low_stock_threshold, 0));

    ALTER TABLE products ALTER COLUMN store_selling_price SET NOT NULL;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_buying_price_nonnegative;
    ALTER TABLE products ADD CONSTRAINT products_buying_price_nonnegative
      CHECK (buying_price IS NULL OR buying_price >= 0);
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_quantity_nonnegative;
    ALTER TABLE products ADD CONSTRAINT products_stock_quantity_nonnegative
      CHECK (stock_quantity >= 0);
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_minimum_stock_nonnegative;
    ALTER TABLE products ADD CONSTRAINT products_minimum_stock_nonnegative
      CHECK (low_stock_threshold >= 0);

    ALTER TABLE ecommerce_listings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ecommerce_listing_media ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS backend_service_role_only ON ecommerce_listings;
    CREATE POLICY backend_service_role_only ON ecommerce_listings
      FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check());
    DROP POLICY IF EXISTS backend_service_role_only ON ecommerce_listing_media;
    CREATE POLICY backend_service_role_only ON ecommerce_listing_media
      FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check());

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE ecommerce_listings, ecommerce_listing_media FROM anon;
        REVOKE ALL ON SEQUENCE ecommerce_listings_id_seq, ecommerce_listing_media_id_seq FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE ecommerce_listings, ecommerce_listing_media FROM authenticated;
        REVOKE ALL ON SEQUENCE ecommerce_listings_id_seq, ecommerce_listing_media_id_seq FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE ecommerce_listings, ecommerce_listing_media TO service_role;
        GRANT ALL ON SEQUENCE ecommerce_listings_id_seq, ecommerce_listing_media_id_seq TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE ecommerce_listings DISABLE ROW LEVEL SECURITY;
    ALTER TABLE ecommerce_listing_media DISABLE ROW LEVEL SECURITY;
    ALTER TABLE products ALTER COLUMN store_selling_price DROP NOT NULL;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_buying_price_nonnegative;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_quantity_nonnegative;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_minimum_stock_nonnegative;
  `);
};
