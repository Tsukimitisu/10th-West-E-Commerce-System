exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE reviews
    SET review_status = 'approved',
        is_approved = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE COALESCE(review_status::text, CASE WHEN is_approved THEN 'approved' ELSE 'pending' END) = 'pending';
  `);
};

exports.down = async function down() {
  // Data-only migration. There is no safe way to distinguish reviews that were
  // intentionally approved from reviews auto-published by this backfill.
};
