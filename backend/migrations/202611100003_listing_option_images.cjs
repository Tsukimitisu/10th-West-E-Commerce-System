exports.up = async knex => {
  await knex.raw(`ALTER TABLE public.ecommerce_listing_items ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE public.ecommerce_listings ADD COLUMN IF NOT EXISTS visual_options BOOLEAN NOT NULL DEFAULT false;`);
};

exports.down = async knex => {
  await knex.raw(`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.ecommerce_listing_items WHERE image_url IS NOT NULL)
      OR EXISTS(SELECT 1 FROM public.ecommerce_listings WHERE visual_options) THEN
      RAISE EXCEPTION 'Cannot remove configured listing option images';
    END IF;
    END $$;
    ALTER TABLE public.ecommerce_listing_items DROP COLUMN IF EXISTS image_url;
    ALTER TABLE public.ecommerce_listings DROP COLUMN IF EXISTS visual_options;`);
};
