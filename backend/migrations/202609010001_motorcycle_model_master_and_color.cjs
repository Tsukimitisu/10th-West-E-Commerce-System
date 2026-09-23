exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('motorcycle_models'))) {
    await knex.schema.createTable('motorcycle_models', (table) => {
      table.increments('id').primary();
      table.string('model_name', 160).notNullable();
      table.string('brand', 100);
      table.text('description');
      table.string('status', 16).notNullable().defaultTo('active');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasColumn('products', 'motorcycle_model_id'))) {
    await knex.schema.alterTable('products', (table) => {
      table.integer('motorcycle_model_id')
        .references('id').inTable('motorcycle_models').onDelete('SET NULL');
    });
  }
  if (!(await knex.schema.hasColumn('products', 'color'))) {
    await knex.schema.alterTable('products', (table) => {
      table.string('color', 100);
    });
  }

  await knex.raw(`
    ALTER TABLE motorcycle_models DROP CONSTRAINT IF EXISTS motorcycle_models_status_check;
    ALTER TABLE motorcycle_models ADD CONSTRAINT motorcycle_models_status_check
      CHECK (status IN ('active', 'inactive'));

    CREATE UNIQUE INDEX IF NOT EXISTS ux_motorcycle_models_name_ci
      ON motorcycle_models (LOWER(BTRIM(model_name)));
    CREATE INDEX IF NOT EXISTS idx_motorcycle_models_status_name
      ON motorcycle_models (status, LOWER(model_name));
    CREATE INDEX IF NOT EXISTS idx_products_motorcycle_model_id
      ON products (motorcycle_model_id);
    CREATE INDEX IF NOT EXISTS idx_products_color_prefix
      ON products (LOWER(color) text_pattern_ops)
      WHERE color IS NOT NULL AND BTRIM(color) <> '';

    INSERT INTO motorcycle_models (model_name, status)
    SELECT MIN(BTRIM(motorcycle_model)), 'active'
      FROM products
     WHERE NULLIF(BTRIM(motorcycle_model), '') IS NOT NULL
     GROUP BY LOWER(BTRIM(motorcycle_model))
    ON CONFLICT DO NOTHING;

    UPDATE products product
       SET motorcycle_model_id = model.id
      FROM motorcycle_models model
     WHERE product.motorcycle_model_id IS NULL
       AND NULLIF(BTRIM(product.motorcycle_model), '') IS NOT NULL
       AND LOWER(BTRIM(model.model_name)) = LOWER(BTRIM(product.motorcycle_model));

    ALTER TABLE motorcycle_models ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS backend_service_role_only ON motorcycle_models;
    CREATE POLICY backend_service_role_only ON motorcycle_models
      FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check());

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE motorcycle_models FROM anon;
        REVOKE ALL ON SEQUENCE motorcycle_models_id_seq FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE motorcycle_models FROM authenticated;
        REVOKE ALL ON SEQUENCE motorcycle_models_id_seq FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE motorcycle_models TO service_role;
        GRANT ALL ON SEQUENCE motorcycle_models_id_seq TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('products', 'motorcycle_model_id')) {
    await knex.schema.alterTable('products', (table) => table.dropColumn('motorcycle_model_id'));
  }
  await knex.schema.dropTableIfExists('motorcycle_models');
  // Color is intentionally retained: rolling back master data must not discard item data.
};
