exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE public.system_cleanup_status ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.system_cleanup_status FROM PUBLIC;

    DROP POLICY IF EXISTS backend_service_role_only ON public.system_cleanup_status;
    CREATE POLICY backend_service_role_only ON public.system_cleanup_status
      FOR ALL USING (public.app_access_check()) WITH CHECK (public.app_access_check());

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.system_cleanup_status FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.system_cleanup_status FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.system_cleanup_status TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down() {
  // Intentionally irreversible: rollback must not restore browser access or
  // disable RLS. Any change requires a new, reviewed security migration.
};
