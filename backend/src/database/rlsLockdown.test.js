import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import lockdown from '../../migrations/202607030001_lock_down_supabase_rls.cjs';
import cleanupSecurity from '../../migrations/202610280001_secure_system_cleanup_status.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  directory,
  '../../migrations/202607030001_lock_down_supabase_rls.cjs'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const schemaMigration = fs.readFileSync(
  path.resolve(directory, '../../migrations/202607030002_revoke_public_schema_access.cjs'),
  'utf8'
);

test('RLS lockdown revokes browser roles and defaults to backend-only policies', () => {
  assert.match(migration, /REVOKE ALL ON SCHEMA public FROM anon/i);
  assert.match(migration, /REVOKE ALL ON TABLE .* FROM authenticated/i);
  assert.match(migration, /CREATE POLICY backend_service_role_only/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES.*REVOKE ALL ON TABLES FROM PUBLIC/is);
  assert.doesNotMatch(migration, /ANY\s*\(\s*ARRAY\s*\[\s*'anon'/i);
});

test('RLS lockdown does not add public storefront exceptions', () => {
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).* TO (?:anon|authenticated)/i);
});

test('RLS lockdown revokes inherited PUBLIC schema access', () => {
  assert.match(schemaMigration, /REVOKE ALL ON SCHEMA public FROM PUBLIC/i);
  assert.doesNotMatch(schemaMigration, /GRANT .* TO (?:anon|authenticated)/i);
});

for (const withBrowserRoles of [false, true]) {
  test(`cleanup status forward migration preserves backend-only access, repeatability and safe rollback (Supabase roles: ${withBrowserRoles})`, async t => {
    const db = new PGlite();
    t.after(() => db.close());
    const knex = { raw: sql => db.exec(sql) };
    if (withBrowserRoles) await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    await lockdown.up(knex);
    // Reproduce a table introduced after the original global security migration.
    await db.exec('CREATE TABLE public.system_cleanup_status(id int PRIMARY KEY, running boolean); INSERT INTO public.system_cleanup_status VALUES(1,false); GRANT ALL ON public.system_cleanup_status TO PUBLIC;');
    if (withBrowserRoles) await db.exec('GRANT ALL ON public.system_cleanup_status TO anon, authenticated;');
    for (let attempt = 0; attempt < 2; attempt++) {
      await cleanupSecurity.up(knex); // Also safe when manually secured already.
      assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.system_cleanup_status'::regclass")).rows[0].relrowsecurity, true);
      const policies = await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='system_cleanup_status'");
      assert.equal(policies.rows.length, 1);
      assert.equal(policies.rows[0].policyname, 'backend_service_role_only');
      assert.equal(policies.rows[0].cmd, 'ALL');
      assert.match(policies.rows[0].qual, /app_access_check\(\)/);
      assert.match(policies.rows[0].with_check, /app_access_check\(\)/);
    }
    await cleanupSecurity.down(knex);
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.system_cleanup_status'::regclass")).rows[0].relrowsecurity, true);
    const publicGrants = await db.query("SELECT a.* FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.oid='public.system_cleanup_status'::regclass AND a.grantee=0");
    assert.equal(publicGrants.rows.length, 0);
    if (withBrowserRoles) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query("SELECT has_table_privilege($1,'public.system_cleanup_status','SELECT,INSERT,UPDATE,DELETE') AS allowed", [role])).rows[0].allowed, false);
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query('SELECT * FROM public.system_cleanup_status'), /permission denied/i);
        await db.exec('RESET ROLE');
      }
      await db.exec('SET ROLE service_role');
      assert.deepEqual((await db.query('SELECT * FROM public.system_cleanup_status')).rows, [{ id: 1, running: false }]);
      await db.exec('RESET ROLE');
    }
    assert.deepEqual((await db.query('SELECT * FROM public.system_cleanup_status')).rows, [{ id: 1, running: false }]);
  });
}
