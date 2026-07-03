import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('RLS verification blocked: SUPABASE_DB_URL or DATABASE_URL is required.');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

const browserRoles = ['anon', 'authenticated'];

try {
  const roles = await pool.query(
    `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [browserRoles]
  );
  const presentRoles = roles.rows.map((row) => row.rolname);

  const grants = await pool.query(
    `SELECT grantee, table_schema, table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee = ANY($1::text[])
     ORDER BY grantee, table_name, privilege_type`,
    [browserRoles]
  );

  const schemaGrants = await pool.query(
    `SELECT role_name
     FROM unnest($1::text[]) AS role_name
     WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
       AND has_schema_privilege(role_name, 'public', 'USAGE')`,
    [browserRoles]
  );

  const unsafePolicies = await pool.query(`
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ~* '(^|[^a-z_])true([^a-z_]|$)'
        OR COALESCE(with_check, '') ~* '(^|[^a-z_])true([^a-z_]|$)'
        OR (
          (COALESCE(qual, '') ILIKE '%app_access_check%'
            OR COALESCE(with_check, '') ILIKE '%app_access_check%')
          AND pg_get_functiondef('public.app_access_check()'::regprocedure)
            ~* '''(anon|authenticated)'''
        )
      )
  `);

  const tablesWithoutRls = await pool.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
    ORDER BY c.relname
  `);

  const failures = [];
  if (grants.rowCount) failures.push(`browser table grants: ${grants.rowCount}`);
  if (schemaGrants.rowCount) failures.push(`browser schema grants: ${schemaGrants.rowCount}`);
  if (unsafePolicies.rowCount) failures.push(`unsafe policies: ${unsafePolicies.rowCount}`);
  if (tablesWithoutRls.rowCount) failures.push(`tables without RLS: ${tablesWithoutRls.rowCount}`);

  const result = {
    checked_roles: presentRoles,
    browser_table_grants: grants.rowCount,
    browser_schema_grants: schemaGrants.rowCount,
    unsafe_policies: unsafePolicies.rowCount,
    tables_without_rls: tablesWithoutRls.rowCount,
    status: failures.length ? 'failed' : 'passed',
  };
  console.log(JSON.stringify(result, null, 2));

  if (failures.length) {
    console.error(`RLS verification failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
