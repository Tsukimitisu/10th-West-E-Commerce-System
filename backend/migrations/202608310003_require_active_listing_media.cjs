exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE ecommerce_listings listing
       SET visibility_status = 'draft', updated_at = NOW()
     WHERE listing.visibility_status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM ecommerce_listing_media media WHERE media.listing_id = listing.id
       );
  `);
};

exports.down = async () => {
  // Do not republish listings that had no media before this safeguard.
};
