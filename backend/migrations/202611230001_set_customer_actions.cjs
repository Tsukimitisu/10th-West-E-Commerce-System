// Additive set identities. Existing product wishlists and chat rows are untouched.
exports.up = async knex => {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS public.storefront_set_wishlists (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES public.ecommerce_listings(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,listing_id)
    );
    CREATE INDEX IF NOT EXISTS idx_set_wishlist_listing ON public.storefront_set_wishlists(listing_id);
    ALTER TABLE public.storefront_set_wishlists ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.storefront_set_wishlists FROM PUBLIC;
    REVOKE ALL ON SEQUENCE public.storefront_set_wishlists_id_seq FROM PUBLIC;
    DO $roles$ DECLARE browser_role TEXT; BEGIN
      IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='storefront_set_wishlists' AND policyname<>'backend_service_role_only') THEN
        RAISE EXCEPTION 'Review unexpected policies on storefront_set_wishlists before continuing';
      END IF;
      FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
          EXECUTE format('REVOKE ALL ON public.storefront_set_wishlists FROM %I',browser_role);
          EXECUTE format('REVOKE ALL ON SEQUENCE public.storefront_set_wishlists_id_seq FROM %I',browser_role);
        END IF;
      END LOOP;
      DROP POLICY IF EXISTS backend_service_role_only ON public.storefront_set_wishlists;
      IF to_regprocedure('public.app_access_check()') IS NOT NULL THEN
        CREATE POLICY backend_service_role_only ON public.storefront_set_wishlists FOR ALL
          USING ((SELECT public.app_access_check())) WITH CHECK ((SELECT public.app_access_check()));
      ELSE
        -- Disposable/local databases may not have the Supabase lockdown helper.
        CREATE POLICY backend_service_role_only ON public.storefront_set_wishlists FOR ALL
          USING (current_user='service_role') WITH CHECK (current_user='service_role');
      END IF;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
        GRANT ALL ON public.storefront_set_wishlists TO service_role;
        GRANT USAGE,SELECT ON SEQUENCE public.storefront_set_wishlists_id_seq TO service_role;
      END IF;
    END $roles$;
    ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS listing_id INTEGER REFERENCES public.ecommerce_listings(id) ON DELETE SET NULL;
    ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS reference_type TEXT;
    DO $constraint$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='chat_set_reference_identity' AND conrelid='public.chat_threads'::regclass) THEN
        ALTER TABLE public.chat_threads ADD CONSTRAINT chat_set_reference_identity CHECK (
          reference_type IS DISTINCT FROM 'storefront_set' OR product_id IS NULL
        );
      END IF;
    END $constraint$;
    CREATE INDEX IF NOT EXISTS idx_chat_set_listing ON public.chat_threads(listing_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_open_customer_set ON public.chat_threads(customer_id,listing_id)
      WHERE reference_type='storefront_set' AND status NOT IN ('closed','blocked');
  `);
};

exports.down = async () => {
  // Retain saved favorites/context and browser denial. An application rollback
  // can ignore these additive fields without deleting customer or legacy data.
};
