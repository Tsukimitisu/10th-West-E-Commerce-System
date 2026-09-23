exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;

    UPDATE products
    SET status = CASE
      WHEN status IS NULL OR btrim(status::text) = '' THEN 'draft'
      WHEN lower(btrim(status::text)) IN ('published', 'available', 'active') THEN 'active'
      WHEN lower(btrim(status::text)) IN ('out_of_stock', 'out-of-stock', 'sold_out', 'sold out') THEN 'out_of_stock'
      WHEN lower(btrim(status::text)) IN ('archived', 'deleted') THEN 'archived'
      ELSE 'draft'
    END;

    ALTER TABLE products
      ALTER COLUMN status SET DEFAULT 'draft',
      ADD CONSTRAINT products_status_check
        CHECK (status IN ('draft', 'active', 'out_of_stock', 'archived'));
  `);
};

exports.down = async function down() {
  // Keep the current product status workflow. Reverting to the older
  // draft/published-only constraint would break active/out_of_stock rows.
};
