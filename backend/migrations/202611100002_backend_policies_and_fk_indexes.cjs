// Express/direct PostgreSQL and service-role clients remain the only data
// boundary. Policies grant no privileges; existing backend ACLs stay unchanged.
exports.up = async knex => {
  await knex.raw(`
    DO $policies$
    DECLARE target TEXT[]; browser_role TEXT;
    BEGIN
      FOREACH target SLICE 1 IN ARRAY ARRAY[
        ARRAY['public','backup_records'], ARRAY['public','backup_scheduler'],
        ARRAY['public','password_reset_sms_challenges'], ARRAY['public','phone_verifications'],
        ARRAY['public','pos_offline_device_requests'], ARRAY['public','pos_offline_devices'],
        ARRAY['public','pos_offline_reserves'], ARRAY['public','pos_offline_sales'],
        ARRAY['public','pos_offline_snapshot_items'], ARRAY['public','pos_offline_snapshots'],
        ARRAY['recovery_control','database_restore_jobs'], ARRAY['recovery_control','state']
      ] LOOP
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=target[1] AND tablename=target[2]
          AND policyname<>'backend_service_role_only') THEN
          RAISE EXCEPTION 'Review unexpected policies on %.% before continuing',target[1],target[2];
        END IF;
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',target[1],target[2]);
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC',target[1],target[2]);
        FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I',target[1],target[2],browser_role);
          END IF;
        END LOOP;
        EXECUTE format('DROP POLICY IF EXISTS backend_service_role_only ON %I.%I',target[1],target[2]);
        EXECUTE format('CREATE POLICY backend_service_role_only ON %I.%I FOR ALL
          USING ((SELECT public.app_access_check())) WITH CHECK ((SELECT public.app_access_check()))',target[1],target[2]);
      END LOOP;
      -- Recovery controls stay inaccessible through browser schema grants too.
      REVOKE ALL ON SCHEMA recovery_control FROM PUBLIC;
      FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
          EXECUTE format('REVOKE ALL ON SCHEMA recovery_control FROM %I',browser_role);
        END IF;
      END LOOP;
    END $policies$;

    -- Check the live catalogue, so equivalent pre-existing indexes (including
    -- composite left prefixes) are reused regardless of their names. INCLUDE
    -- columns, expressions and partial indexes are not full FK coverage.
    DO $indexes$
    DECLARE fk RECORD; columns_sql TEXT; columns_name TEXT; index_name TEXT;
    BEGIN
      FOR fk IN
        SELECT con.conrelid,con.conkey,ns.nspname AS schema_name,t.relname AS table_name
        FROM pg_constraint con JOIN pg_class t ON t.oid=con.conrelid
        JOIN pg_namespace ns ON ns.oid=t.relnamespace
        WHERE con.contype='f' AND ns.nspname IN ('public','recovery_control')
        ORDER BY ns.nspname,t.relname,con.conname
      LOOP
        IF EXISTS (
          SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid
          JOIN pg_am am ON am.oid=ic.relam
          WHERE i.indrelid=fk.conrelid AND i.indisvalid AND i.indisready
            AND am.amname='btree' AND i.indpred IS NULL
            AND i.indnkeyatts>=cardinality(fk.conkey)
            AND ARRAY(SELECT i.indkey[position] FROM generate_series(0,cardinality(fk.conkey)-1) position) @> fk.conkey
        ) THEN CONTINUE; END IF;
        SELECT string_agg(format('%I',a.attname),',' ORDER BY k.position),
               string_agg(a.attname,'_' ORDER BY k.position)
          INTO columns_sql,columns_name
          FROM unnest(fk.conkey) WITH ORDINALITY k(attnum,position)
          JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.attnum;
        index_name := 'idx_fk_' || fk.table_name || '_' || columns_name;
        IF octet_length(index_name)>63 THEN
          index_name := left(index_name,45) || '_' || substr(md5(fk.schema_name || '.' || fk.table_name || '.' || columns_name),1,12);
        END IF;
        -- A conflicting name with a different definition fails transactionally;
        -- IF NOT EXISTS here would silently leave an FK unprotected.
        EXECUTE format('CREATE INDEX %I ON %I.%I (%s)',index_name,fk.schema_name,fk.table_name,columns_sql);
      END LOOP;
    END $indexes$;

    -- The UNIQUE constraint already serves the exact OAuth code_hash lookup.
    -- Drop only the verified non-unique duplicate, never its unique keeper.
    DO $duplicate$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_index d JOIN pg_index k ON k.indrelid=d.indrelid
        JOIN pg_class dc ON dc.oid=d.indexrelid JOIN pg_class kc ON kc.oid=k.indexrelid
        WHERE d.indexrelid=to_regclass('public.idx_oauth_codes_hash')
          AND k.indexrelid=to_regclass('public.oauth_codes_code_hash_key')
          AND d.indrelid=to_regclass('public.oauth_codes')
          AND NOT d.indisunique AND k.indisunique AND d.indisvalid AND k.indisvalid
          AND d.indisready AND k.indisready
          AND ROW(d.indnkeyatts,d.indnatts,d.indkey::text,d.indclass::text,d.indcollation::text,d.indoption::text,
            pg_get_expr(d.indexprs,d.indrelid),pg_get_expr(d.indpred,d.indrelid),dc.relam)
          IS NOT DISTINCT FROM ROW(k.indnkeyatts,k.indnatts,k.indkey::text,k.indclass::text,k.indcollation::text,k.indoption::text,
            pg_get_expr(k.indexprs,k.indrelid),pg_get_expr(k.indpred,k.indrelid),kc.relam)
          AND EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=k.indexrelid AND contype='u')
          AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=d.indexrelid)
          AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE refclassid='pg_class'::regclass
            AND refobjid=d.indexrelid AND deptype NOT IN ('i','a'))
      ) THEN DROP INDEX public.idx_oauth_codes_hash; END IF;
    END $duplicate$;
  `);
};

exports.down = async () => {
  // Forward-only security/performance hardening: retain policies, revocations
  // and FK coverage. Never reopen browser access or remove useful indexes.
};
