const PRODUCT_IMAGE_FALLBACK = '/images/product-fallback.svg';
const BLOCKED_PRODUCT_IMAGE_PATTERN = '(images\\.unsplash\\.com|source\\.unsplash\\.com|plus\\.unsplash\\.com)';

exports.up = async (knex) => {
  await knex.raw(
    `
      UPDATE products
      SET image = CASE
            WHEN COALESCE(image, '') ~* ? THEN ?
            ELSE image
          END,
          image_urls = CASE
            WHEN image_urls IS NULL THEN image_urls
            ELSE COALESCE((
              SELECT jsonb_agg(
                CASE WHEN urls.value ~* ? THEN ? ELSE urls.value END
                ORDER BY urls.ordinality
              )
              FROM jsonb_array_elements_text(COALESCE(image_urls, '[]'::jsonb))
                WITH ORDINALITY AS urls(value, ordinality)
            ), '[]'::jsonb)
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(image, '') ~* ?
         OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(image_urls, '[]'::jsonb)) AS urls(value)
              WHERE urls.value ~* ?
            );
    `,
    [
      BLOCKED_PRODUCT_IMAGE_PATTERN,
      PRODUCT_IMAGE_FALLBACK,
      BLOCKED_PRODUCT_IMAGE_PATTERN,
      PRODUCT_IMAGE_FALLBACK,
      BLOCKED_PRODUCT_IMAGE_PATTERN,
      BLOCKED_PRODUCT_IMAGE_PATTERN,
    ],
  );

  await knex.raw(
    `
      UPDATE product_variants
      SET image_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(image_url, '') ~* ?;
    `,
    [PRODUCT_IMAGE_FALLBACK, BLOCKED_PRODUCT_IMAGE_PATTERN],
  );

  await knex.raw(
    `
      UPDATE order_items
      SET image_snapshot = ?
      WHERE COALESCE(image_snapshot, '') ~* ?;
    `,
    [PRODUCT_IMAGE_FALLBACK, BLOCKED_PRODUCT_IMAGE_PATTERN],
  );
};

exports.down = async () => {
  // Intentionally not restoring browser-blocked hotlinked image URLs.
};
