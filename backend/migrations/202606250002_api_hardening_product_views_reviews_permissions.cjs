exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('products', 'view_count'))) {
    await knex.schema.alterTable('products', (table) => {
      table.integer('view_count').notNullable().defaultTo(0);
    });
  }

  if (!(await knex.schema.hasTable('product_views'))) {
    await knex.schema.createTable('product_views', (table) => {
      table.bigIncrements('id').primary();
      table.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.string('visitor_hash', 128);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_product_views_product_created ON product_views(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_product_views_user_created ON product_views(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_product_views_visitor_created ON product_views(visitor_hash, created_at);
    ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS product_views_service_role_only ON product_views;
    CREATE POLICY product_views_service_role_only ON product_views
      FOR ALL
      USING (current_setting('request.jwt.claim.role', true) = 'service_role')
      WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON product_views FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON product_views FROM authenticated;
      END IF;
    END $$;
  `);

  await knex('permissions')
    .insert([{ name: 'reviews.moderate', description: 'Moderate customer reviews', category: 'Reviews' }])
    .onConflict('name')
    .ignore();

  await knex.raw(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT r.role::user_role_enum, p.id
    FROM (VALUES ('admin'), ('super_admin'), ('owner')) AS r(role)
    CROSS JOIN permissions p
    WHERE p.name = 'reviews.moderate'
    ON CONFLICT (role, permission_id) DO NOTHING
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'reviews.moderate');
    DELETE FROM permissions WHERE name = 'reviews.moderate';
  `);
  await knex.schema.dropTableIfExists('product_views');
  if (await knex.schema.hasColumn('products', 'view_count')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('view_count');
    });
  }
};
