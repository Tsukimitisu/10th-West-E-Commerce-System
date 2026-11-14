// Additive only. Existing single listings keep inventory_item_id and default to
// listing_type='single'. A set listing owns no inventory row; it links existing
// products through ecommerce_listing_items (relationship only, no duplicates).
exports.up = async function up(knex) {
  const additions = {
    listing_type: (table) => table.string('listing_type', 12).notNullable().defaultTo('single'),
    title: (table) => table.string('title', 160),
    motorcycle_model_id: (table) => table.integer('motorcycle_model_id').references('id').inTable('motorcycle_models').onDelete('SET NULL'),
  };
  for (const [column, add] of Object.entries(additions)) {
    if (!(await knex.schema.hasColumn('ecommerce_listings', column))) await knex.schema.alterTable('ecommerce_listings', add);
  }

  if (!(await knex.schema.hasTable('ecommerce_listing_items'))) {
    await knex.schema.createTable('ecommerce_listing_items', (table) => {
      table.integer('listing_id').notNullable().references('id').inTable('ecommerce_listings').onDelete('CASCADE');
      table.integer('product_item_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.integer('sort_order').notNullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.primary(['listing_id', 'product_item_id']);
      table.unique(['listing_id', 'sort_order'], { indexName: 'ux_ecommerce_listing_items_order' });
      table.index(['product_item_id'], 'idx_ecommerce_listing_items_product');
    });
  }

  await knex.raw(`
    ALTER TABLE ecommerce_listings ALTER COLUMN inventory_item_id DROP NOT NULL;
    ALTER TABLE ecommerce_listings DROP CONSTRAINT IF EXISTS ecommerce_listings_listing_type_check;
    ALTER TABLE ecommerce_listings ADD CONSTRAINT ecommerce_listings_listing_type_check CHECK (
      (listing_type = 'single' AND inventory_item_id IS NOT NULL)
      OR (listing_type = 'set' AND inventory_item_id IS NULL AND NULLIF(BTRIM(title), '') IS NOT NULL)
    );
    ALTER TABLE ecommerce_listing_items DROP CONSTRAINT IF EXISTS ecommerce_listing_items_order_check;
    ALTER TABLE ecommerce_listing_items ADD CONSTRAINT ecommerce_listing_items_order_check
      CHECK (sort_order BETWEEN 0 AND 49);
    CREATE INDEX IF NOT EXISTS idx_ecommerce_listings_type_visibility
      ON ecommerce_listings (listing_type, visibility_status);

    ALTER TABLE ecommerce_listing_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS backend_service_role_only ON ecommerce_listing_items;
    CREATE POLICY backend_service_role_only ON ecommerce_listing_items
      FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check());

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE ecommerce_listing_items FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE ecommerce_listing_items FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE ecommerce_listing_items TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down(knex) {
  // Set listings cannot exist without the relation table; remove them before
  // restoring the original NOT NULL contract for single listings.
  await knex.schema.dropTableIfExists('ecommerce_listing_items');
  if (await knex.schema.hasColumn('ecommerce_listings', 'listing_type')) {
    await knex.raw(`
      DELETE FROM ecommerce_listings WHERE listing_type = 'set';
      ALTER TABLE ecommerce_listings DROP CONSTRAINT IF EXISTS ecommerce_listings_listing_type_check;
      DROP INDEX IF EXISTS idx_ecommerce_listings_type_visibility;
      ALTER TABLE ecommerce_listings ALTER COLUMN inventory_item_id SET NOT NULL;
    `);
  }
  for (const column of ['motorcycle_model_id', 'title', 'listing_type']) {
    if (await knex.schema.hasColumn('ecommerce_listings', column)) {
      await knex.schema.alterTable('ecommerce_listings', (table) => table.dropColumn(column));
    }
  }
};
