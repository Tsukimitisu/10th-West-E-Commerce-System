exports.up = async knex => {
  await knex.raw(`
    ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS explicitly_refreshed_at TIMESTAMPTZ;
    DO $$ BEGIN
      IF to_regprocedure('public.protect_offline_pos_hold()') IS NOT NULL THEN
        ALTER FUNCTION public.protect_offline_pos_hold() SET search_path = pg_catalog, public, pg_temp;
      END IF;
    END $$;
    ALTER TABLE public.registration_otps ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.registration_otps FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.registration_otps FROM anon; END IF;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.registration_otps FROM authenticated; END IF;
    END $$;
    DROP POLICY IF EXISTS backend_service_role_only ON public.registration_otps;
    DROP POLICY IF EXISTS registration_otps_restricted_access ON public.registration_otps;
    -- Preserve the union of the two existing backend-only policies, evaluated
    -- once per statement rather than once for every OTP row.
    CREATE POLICY backend_service_role_only ON public.registration_otps FOR ALL
      USING ((SELECT public.app_access_check()) OR (SELECT current_setting('role',true))='service_role')
      WITH CHECK ((SELECT public.app_access_check()) OR (SELECT current_setting('role',true))='service_role');
    DO $$
    DECLARE pair TEXT[]; duplicate_oid OID; keeper_oid OID; equivalent BOOLEAN;
    BEGIN
      FOREACH pair SLICE 1 IN ARRAY ARRAY[
        ARRAY['idx_carts_session_id','idx_carts_session'],
        ARRAY['idx_sessions_token_hash','idx_sessions_token'],
        ARRAY['ux_wishlists_user_product','wishlists_user_id_product_id_key']
      ] LOOP
        duplicate_oid := to_regclass('public.' || pair[1]);
        keeper_oid := to_regclass('public.' || pair[2]);
        IF duplicate_oid IS NULL OR keeper_oid IS NULL THEN CONTINUE; END IF;
        IF EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=duplicate_oid)
          OR EXISTS(SELECT 1 FROM pg_depend WHERE refobjid=duplicate_oid AND deptype NOT IN ('i','a')) THEN CONTINUE; END IF;
        SELECT ROW(d.indrelid,d.indisunique,d.indnkeyatts,d.indnatts,d.indkey::text,d.indclass::text,d.indcollation::text,d.indoption::text,
          pg_get_expr(d.indexprs,d.indrelid),pg_get_expr(d.indpred,d.indrelid),dc.relam,d.indnullsnotdistinct)
          IS NOT DISTINCT FROM ROW(k.indrelid,k.indisunique,k.indnkeyatts,k.indnatts,k.indkey::text,k.indclass::text,k.indcollation::text,k.indoption::text,
          pg_get_expr(k.indexprs,k.indrelid),pg_get_expr(k.indpred,k.indrelid),kc.relam,k.indnullsnotdistinct)
          AND d.indisvalid AND k.indisvalid INTO equivalent
          FROM pg_index d JOIN pg_class dc ON dc.oid=d.indexrelid,
               pg_index k JOIN pg_class kc ON kc.oid=k.indexrelid
          WHERE d.indexrelid=duplicate_oid AND k.indexrelid=keeper_oid;
        IF equivalent THEN EXECUTE format('DROP INDEX public.%I',pair[1]); END IF;
      END LOOP;
    END $$;
  `);
};

exports.down = async () => {
  // Forward-only security hardening. Never restore permissive policies or a
  // mutable function path; retained session metadata is harmless on rollback.
};
