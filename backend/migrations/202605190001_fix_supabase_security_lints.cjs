exports.up = async function up(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.app_access_check()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = pg_catalog
    AS $$ SELECT current_setting('role', true) = ANY(ARRAY['anon', 'authenticated', 'service_role']) $$;

    ALTER TABLE IF EXISTS public.product_fitments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.product_bundle_components ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_threads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_participants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_quick_replies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS product_fitments_select_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_insert_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_update_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_delete_policy ON public.product_fitments;
    CREATE POLICY product_fitments_select_policy ON public.product_fitments FOR SELECT USING (true);
    CREATE POLICY product_fitments_insert_policy ON public.product_fitments FOR INSERT WITH CHECK (public.app_access_check());
    CREATE POLICY product_fitments_update_policy ON public.product_fitments FOR UPDATE USING (public.app_access_check()) WITH CHECK (public.app_access_check());
    CREATE POLICY product_fitments_delete_policy ON public.product_fitments FOR DELETE USING (public.app_access_check());

    DROP POLICY IF EXISTS product_bundle_components_select_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_insert_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_update_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_delete_policy ON public.product_bundle_components;
    CREATE POLICY product_bundle_components_select_policy ON public.product_bundle_components FOR SELECT USING (true);
    CREATE POLICY product_bundle_components_insert_policy ON public.product_bundle_components FOR INSERT WITH CHECK (public.app_access_check());
    CREATE POLICY product_bundle_components_update_policy ON public.product_bundle_components FOR UPDATE USING (public.app_access_check()) WITH CHECK (public.app_access_check());
    CREATE POLICY product_bundle_components_delete_policy ON public.product_bundle_components FOR DELETE USING (public.app_access_check());

    DROP POLICY IF EXISTS chat_threads_service_role_policy ON public.chat_threads;
    DROP POLICY IF EXISTS chat_participants_service_role_policy ON public.chat_participants;
    DROP POLICY IF EXISTS chat_messages_service_role_policy ON public.chat_messages;
    DROP POLICY IF EXISTS chat_quick_replies_service_role_policy ON public.chat_quick_replies;

    CREATE POLICY chat_threads_service_role_policy ON public.chat_threads FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
    CREATE POLICY chat_participants_service_role_policy ON public.chat_participants FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
    CREATE POLICY chat_messages_service_role_policy ON public.chat_messages FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');
    CREATE POLICY chat_quick_replies_service_role_policy ON public.chat_quick_replies FOR ALL
      USING (current_setting('role', true) = 'service_role')
      WITH CHECK (current_setting('role', true) = 'service_role');

    DO $$
    BEGIN
      IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS review_media_select_policy ON storage.objects;
      END IF;
    END $$;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP POLICY IF EXISTS product_fitments_select_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_insert_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_update_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_fitments_delete_policy ON public.product_fitments;
    DROP POLICY IF EXISTS product_bundle_components_select_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_insert_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_update_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS product_bundle_components_delete_policy ON public.product_bundle_components;
    DROP POLICY IF EXISTS chat_threads_service_role_policy ON public.chat_threads;
    DROP POLICY IF EXISTS chat_participants_service_role_policy ON public.chat_participants;
    DROP POLICY IF EXISTS chat_messages_service_role_policy ON public.chat_messages;
    DROP POLICY IF EXISTS chat_quick_replies_service_role_policy ON public.chat_quick_replies;

    ALTER TABLE IF EXISTS public.product_fitments DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.product_bundle_components DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_threads DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_participants DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_messages DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chat_quick_replies DISABLE ROW LEVEL SECURITY;

    CREATE OR REPLACE FUNCTION public.app_access_check()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$ SELECT current_setting('role', true) = ANY(ARRAY['anon', 'authenticated', 'service_role']) $$;

    DO $$
    BEGIN
      IF to_regclass('storage.objects') IS NOT NULL THEN
        CREATE POLICY review_media_select_policy
        ON storage.objects FOR SELECT
        USING (bucket_id = 'review-media');
      END IF;
    END $$;
  `);
};
