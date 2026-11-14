/**
 * The application uses its Express API as the only public data boundary.
 * Browser clients must never access application tables through PostgREST.
 * The backend uses a direct PostgreSQL connection or the service-role key.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.app_access_check()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = pg_catalog
    AS $function$
      SELECT current_user = 'service_role'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    $function$;

    REVOKE ALL ON FUNCTION public.app_access_check() FROM PUBLIC;

    DO $lockdown$
    DECLARE
      object_record record;
      policy_record record;
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA public FROM anon;
        REVOKE ALL ON FUNCTION public.app_access_check() FROM anon;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA public FROM authenticated;
        REVOKE ALL ON FUNCTION public.app_access_check() FROM authenticated;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT EXECUTE ON FUNCTION public.app_access_check() TO service_role;
      END IF;

      FOR object_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
      LOOP
        FOR policy_record IN
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = object_record.schemaname
            AND tablename = object_record.tablename
        LOOP
          EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_record.policyname,
            object_record.schemaname,
            object_record.tablename
          );
        END LOOP;

        EXECUTE format(
          'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
          object_record.schemaname,
          object_record.tablename
        );
        EXECUTE format(
          'CREATE POLICY backend_service_role_only ON %I.%I FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check())',
          object_record.schemaname,
          object_record.tablename
        );

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', object_record.schemaname, object_record.tablename);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM authenticated', object_record.schemaname, object_record.tablename);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          EXECUTE format('GRANT ALL ON TABLE %I.%I TO service_role', object_record.schemaname, object_record.tablename);
        END IF;
      END LOOP;

      FOR object_record IN
        SELECT schemaname, viewname AS object_name
        FROM pg_views
        WHERE schemaname = 'public'
        UNION ALL
        SELECT schemaname, matviewname AS object_name
        FROM pg_matviews
        WHERE schemaname = 'public'
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', object_record.schemaname, object_record.object_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM authenticated', object_record.schemaname, object_record.object_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          EXECUTE format('GRANT SELECT ON TABLE %I.%I TO service_role', object_record.schemaname, object_record.object_name);
        END IF;
      END LOOP;

      FOR object_record IN
        SELECT sequence_schema, sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = 'public'
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM anon', object_record.sequence_schema, object_record.sequence_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM authenticated', object_record.sequence_schema, object_record.sequence_name);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          EXECUTE format('GRANT ALL ON SEQUENCE %I.%I TO service_role', object_record.sequence_schema, object_record.sequence_name);
        END IF;
      END LOOP;
    END
    $lockdown$;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  `);
};

exports.down = async function down() {
  // Security migrations are intentionally irreversible. Reintroducing browser
  // table privileges requires a new, reviewed migration with explicit policies.
};
