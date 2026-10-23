const PRIVATE_TABLES = ['product_images', 'chat_attachments'];

exports.up = async function up(knex) {
  await knex.raw(`
    DO $secure$
    DECLARE
      table_name text;
      policy_name text;
    BEGIN
      FOREACH table_name IN ARRAY ARRAY[${PRIVATE_TABLES.map((table) => `'${table}'`).join(', ')}]
      LOOP
        IF to_regclass('public.' || table_name) IS NULL THEN
          CONTINUE;
        END IF;

        FOR policy_name IN
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = table_name
        LOOP
          EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
        END LOOP;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL USING (current_setting(''request.jwt.claim.role'', true) = ''service_role'') WITH CHECK (current_setting(''request.jwt.claim.role'', true) = ''service_role'')',
          table_name || '_service_role_only',
          table_name
        );

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', table_name);
        END IF;
      END LOOP;

      IF to_regclass('public.chat_conversations') IS NOT NULL THEN
        ALTER VIEW public.chat_conversations SET (security_invoker = true);
      END IF;
    END
    $secure$;
  `);
};

exports.down = async function down() {
  // Deliberately retain the secure configuration rather than reintroducing
  // SECURITY DEFINER behavior or public tables without RLS.
};
