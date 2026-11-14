exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 1) DEFAULT 0;

    UPDATE products p
    SET rating = stats.avg_rating
    FROM (
      SELECT
        product_id,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::DECIMAL(3, 1) AS avg_rating
      FROM reviews
      WHERE COALESCE(review_status::text, CASE WHEN is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      GROUP BY product_id
    ) stats
    WHERE p.id = stats.product_id;

    UPDATE products
    SET rating = 0
    WHERE rating IS NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE products
      DROP COLUMN IF EXISTS rating;
  `);
};
