BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

UPDATE public.products
SET status = CASE
  WHEN status IS NULL OR btrim(status::text) = '' THEN 'draft'
  WHEN lower(btrim(status::text)) IN ('published', 'available', 'active') THEN 'active'
  WHEN lower(btrim(status::text)) IN ('out_of_stock', 'out-of-stock', 'sold_out', 'sold out') THEN 'out_of_stock'
  WHEN lower(btrim(status::text)) IN ('archived', 'deleted') THEN 'archived'
  ELSE 'draft'
END;

ALTER TABLE public.products
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'active', 'out_of_stock', 'archived'));

CREATE OR REPLACE FUNCTION public.app_access_check()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$ SELECT current_setting('role', true) = ANY(ARRAY['anon', 'authenticated', 'service_role']) $$;

DO $$
BEGIN
  IF to_regclass('public.product_fitments') IS NOT NULL THEN
    ALTER TABLE public.product_fitments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS product_fitments_select_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_insert_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_update_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_delete_policy ON public.product_fitments;
    CREATE POLICY product_fitments_select_policy ON public.product_fitments FOR SELECT USING (true);
    CREATE POLICY product_fitments_insert_policy ON public.product_fitments FOR INSERT WITH CHECK (public.app_access_check());
    CREATE POLICY product_fitments_update_policy ON public.product_fitments FOR UPDATE USING (public.app_access_check()) WITH CHECK (public.app_access_check());
    CREATE POLICY product_fitments_delete_policy ON public.product_fitments FOR DELETE USING (public.app_access_check());
  END IF;

  IF to_regclass('public.product_bundle_components') IS NOT NULL THEN
    ALTER TABLE public.product_bundle_components ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS product_bundle_components_select_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_insert_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_update_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_delete_policy ON public.product_bundle_components;
    CREATE POLICY product_bundle_components_select_policy ON public.product_bundle_components FOR SELECT USING (true);
    CREATE POLICY product_bundle_components_insert_policy ON public.product_bundle_components FOR INSERT WITH CHECK (public.app_access_check());
    CREATE POLICY product_bundle_components_update_policy ON public.product_bundle_components FOR UPDATE USING (public.app_access_check()) WITH CHECK (public.app_access_check());
    CREATE POLICY product_bundle_components_delete_policy ON public.product_bundle_components FOR DELETE USING (public.app_access_check());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.chat_threads') IS NOT NULL THEN
    ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS chat_threads_service_role_policy ON public.chat_threads;
    CREATE POLICY chat_threads_service_role_policy ON public.chat_threads FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;

  IF to_regclass('public.chat_participants') IS NOT NULL THEN
    ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS chat_participants_service_role_policy ON public.chat_participants;
    CREATE POLICY chat_participants_service_role_policy ON public.chat_participants FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS chat_messages_service_role_policy ON public.chat_messages;
    CREATE POLICY chat_messages_service_role_policy ON public.chat_messages FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;

  IF to_regclass('public.chat_quick_replies') IS NOT NULL THEN
    ALTER TABLE public.chat_quick_replies ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS chat_quick_replies_service_role_policy ON public.chat_quick_replies;
    CREATE POLICY chat_quick_replies_service_role_policy ON public.chat_quick_replies FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS review_media_select_policy ON storage.objects;
  END IF;
END $$;

COMMIT;
