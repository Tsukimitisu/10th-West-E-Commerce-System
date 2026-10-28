const addColumnIfMissing = async (knex, tableName, columnName, callback) => {
  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, callback);
  }
};

exports.up = async function up(knex) {
  await addColumnIfMissing(knex, 'products', 'store_selling_price', (table) => {
    table.decimal('store_selling_price', 12, 2);
  });
  await addColumnIfMissing(knex, 'products', 'motorcycle_model', (table) => {
    table.string('motorcycle_model', 160);
  });
  await addColumnIfMissing(knex, 'products', 'box_location', (table) => {
    table.string('box_location', 100);
  });
  await addColumnIfMissing(knex, 'products', 'inventory_status', (table) => {
    table.string('inventory_status', 24).notNullable().defaultTo('active');
  });

  await knex.raw(`
    UPDATE products
       SET store_selling_price = COALESCE(store_selling_price, price, 0),
           box_location = COALESCE(NULLIF(BTRIM(box_location), ''), NULLIF(BTRIM(box_number), '')),
           inventory_status = CASE
             WHEN COALESCE(is_deleted, false) THEN 'discontinued'
             WHEN status = 'archived' THEN 'discontinued'
             ELSE COALESCE(NULLIF(inventory_status, ''), 'active')
           END;

    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_store_selling_price_nonnegative;
    ALTER TABLE products ADD CONSTRAINT products_store_selling_price_nonnegative
      CHECK (store_selling_price >= 0);
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_inventory_status_check;
    ALTER TABLE products ADD CONSTRAINT products_inventory_status_check
      CHECK (inventory_status IN ('active', 'inactive', 'discontinued'));

    CREATE INDEX IF NOT EXISTS idx_products_part_number_prefix
      ON products (LOWER(part_number) text_pattern_ops)
      WHERE part_number IS NOT NULL AND BTRIM(part_number) <> '';
    CREATE INDEX IF NOT EXISTS idx_products_inventory_name_prefix
      ON products (LOWER(name) text_pattern_ops);
    CREATE INDEX IF NOT EXISTS idx_products_motorcycle_model_prefix
      ON products (LOWER(motorcycle_model) text_pattern_ops)
      WHERE motorcycle_model IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_box_location_prefix
      ON products (LOWER(box_location) text_pattern_ops)
      WHERE box_location IS NOT NULL;
  `);

  if (!(await knex.schema.hasTable('ecommerce_listings'))) {
    await knex.schema.createTable('ecommerce_listings', (table) => {
      table.increments('id').primary();
      table.integer('inventory_item_id').notNullable().unique()
        .references('id').inTable('products').onDelete('CASCADE');
      table.text('ecommerce_description');
      table.string('visibility_status', 24).notNullable().defaultTo('draft');
      table.boolean('is_featured').notNullable().defaultTo(false);
      table.boolean('is_best_seller').notNullable().defaultTo(false);
      table.boolean('is_new_arrival').notNullable().defaultTo(false);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.index(['visibility_status'], 'idx_ecommerce_listings_visibility');
    });
  }

  await knex.raw(`
    ALTER TABLE ecommerce_listings DROP CONSTRAINT IF EXISTS ecommerce_listings_visibility_status_check;
    ALTER TABLE ecommerce_listings ADD CONSTRAINT ecommerce_listings_visibility_status_check
      CHECK (visibility_status IN ('draft', 'active', 'hidden', 'archived'));

    INSERT INTO ecommerce_listings (
      inventory_item_id, ecommerce_description, visibility_status,
      is_featured, is_best_seller, is_new_arrival
    )
    SELECT p.id, p.description,
           CASE
             WHEN COALESCE(p.is_deleted, false) OR p.status = 'archived' THEN 'archived'
             WHEN p.status IN ('active', 'out_of_stock') THEN 'active'
             ELSE 'draft'
           END,
           false, false, false
      FROM products p
    ON CONFLICT (inventory_item_id) DO NOTHING;
  `);

  if (!(await knex.schema.hasTable('ecommerce_listing_media'))) {
    await knex.schema.createTable('ecommerce_listing_media', (table) => {
      table.increments('id').primary();
      table.integer('listing_id').notNullable()
        .references('id').inTable('ecommerce_listings').onDelete('CASCADE');
      table.text('url').notNullable();
      table.string('media_type', 12).notNullable();
      table.integer('sort_order').notNullable();
      table.string('alt_text', 255);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.unique(['listing_id', 'sort_order'], { indexName: 'ux_ecommerce_listing_media_order' });
    });
  }

  await knex.raw(`
    ALTER TABLE ecommerce_listing_media DROP CONSTRAINT IF EXISTS ecommerce_listing_media_type_check;
    ALTER TABLE ecommerce_listing_media ADD CONSTRAINT ecommerce_listing_media_type_check
      CHECK (media_type IN ('image', 'video'));
    ALTER TABLE ecommerce_listing_media DROP CONSTRAINT IF EXISTS ecommerce_listing_media_order_check;
    ALTER TABLE ecommerce_listing_media ADD CONSTRAINT ecommerce_listing_media_order_check
      CHECK (sort_order BETWEEN 0 AND 9);

    WITH media_candidates AS (
      SELECT p.id AS inventory_item_id, p.image AS url, 'image'::text AS media_type, 0 AS priority
        FROM products p WHERE NULLIF(BTRIM(p.image), '') IS NOT NULL
      UNION ALL
      SELECT p.id, media.url, 'image', 10 + media.ordinality::int
        FROM products p
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.image_urls, '[]'::jsonb))
          WITH ORDINALITY AS media(url, ordinality)
       WHERE NULLIF(BTRIM(media.url), '') IS NOT NULL
         AND media.url IS DISTINCT FROM p.image
      UNION ALL
      SELECT p.id, p.video_url, 'video', 1000
        FROM products p WHERE NULLIF(BTRIM(p.video_url), '') IS NOT NULL
    ), ranked AS (
      SELECT DISTINCT ON (inventory_item_id, url)
             inventory_item_id, url, media_type, priority
        FROM media_candidates
       ORDER BY inventory_item_id, url, priority
    ), numbered AS (
      SELECT inventory_item_id, url, media_type,
             ROW_NUMBER() OVER (PARTITION BY inventory_item_id ORDER BY priority, url) - 1 AS sort_order
        FROM ranked
    )
    INSERT INTO ecommerce_listing_media (listing_id, url, media_type, sort_order)
    SELECT listing.id, numbered.url, numbered.media_type, numbered.sort_order
      FROM numbered
      JOIN ecommerce_listings listing ON listing.inventory_item_id = numbered.inventory_item_id
     WHERE numbered.sort_order < 10
    ON CONFLICT (listing_id, sort_order) DO NOTHING;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ecommerce_listing_media');
  await knex.schema.dropTableIfExists('ecommerce_listings');
  for (const column of ['inventory_status', 'box_location', 'motorcycle_model', 'store_selling_price']) {
    if (await knex.schema.hasColumn('products', column)) {
      await knex.schema.alterTable('products', (table) => table.dropColumn(column));
    }
  }
};
