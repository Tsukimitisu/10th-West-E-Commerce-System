import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import migration from '../../migrations/202611100001_session_and_advisor_hardening.cjs';
import lockdown from '../../migrations/202607030001_lock_down_supabase_rls.cjs';

for (const browserRoles of [false,true]) test(`advisor hardening preserves data/permissions, backend-only RLS and constraint indexes (browser roles=${browserRoles})`, async t => {
  const db = new PGlite(); t.after(() => db.close());
  if (browserRoles) await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  await db.exec(`CREATE TABLE sessions(id int PRIMARY KEY,token_hash text); CREATE INDEX idx_sessions_token ON sessions(token_hash); CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
    CREATE TABLE carts(id int PRIMARY KEY,session_id text);CREATE INDEX idx_carts_session ON carts(session_id);CREATE INDEX idx_carts_session_id ON carts(session_id);
    CREATE TABLE wishlists(id int PRIMARY KEY,user_id int,product_id int,CONSTRAINT wishlists_user_id_product_id_key UNIQUE(user_id,product_id));CREATE UNIQUE INDEX ux_wishlists_user_product ON wishlists(user_id,product_id);
    CREATE TABLE registration_otps(id int PRIMARY KEY); INSERT INTO registration_otps VALUES(1);
    CREATE TABLE products(id int PRIMARY KEY,stock_quantity int,reserved_stock int);INSERT INTO products VALUES(1,5,2);
    CREATE TABLE pos_offline_reserves(product_id int,variant_id int,remaining int);INSERT INTO pos_offline_reserves VALUES(1,NULL,2);
    CREATE FUNCTION public.protect_offline_pos_hold() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE held int; BEGIN
      SELECT COALESCE(SUM(remaining),0) INTO held FROM pos_offline_reserves WHERE product_id=NEW.id;
      IF NEW.reserved_stock<held THEN RAISE EXCEPTION 'Stock protected';END IF;RETURN NEW;END $$;
    CREATE TRIGGER offline_hold BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION protect_offline_pos_hold();`);
  await lockdown.up({ raw: sql => db.exec(sql) });
  await db.exec(`CREATE POLICY registration_otps_restricted_access ON registration_otps FOR ALL USING(current_setting('role',true)='service_role') WITH CHECK(current_setting('role',true)='service_role')`);
  const before = (await db.query("SELECT prosrc,prosecdef,proacl FROM pg_proc WHERE oid='public.protect_offline_pos_hold()'::regprocedure")).rows[0];
  await migration.up({ raw: sql => db.exec(sql) });
  await migration.up({ raw: sql => db.exec(sql) });
  const after = (await db.query("SELECT prosrc,prosecdef,proacl,proconfig FROM pg_proc WHERE oid='public.protect_offline_pos_hold()'::regprocedure")).rows[0];
  assert.deepEqual({ prosrc: after.prosrc,prosecdef:after.prosecdef,proacl:after.proacl },before);
  assert.deepEqual(after.proconfig,['search_path=pg_catalog, public, pg_temp']);
  await db.exec('CREATE TEMP TABLE pos_offline_reserves(product_id int,remaining int); INSERT INTO pg_temp.pos_offline_reserves VALUES(1,0)');
  await assert.rejects(db.exec('UPDATE public.products SET reserved_stock=0'), /Stock protected/);
  const policies = (await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE tablename='registration_otps'")).rows;
  assert.equal(policies.length,1); assert.equal(policies[0].policyname,'backend_service_role_only');
  assert.match(policies[0].qual,/SELECT/); assert.match(policies[0].with_check,/SELECT/);
  for (const removed of ['idx_sessions_token_hash','idx_carts_session_id','ux_wishlists_user_product']) assert.equal((await db.query('SELECT to_regclass($1) AS index',[removed])).rows[0].index,null);
  for (const kept of ['idx_sessions_token','idx_carts_session','wishlists_user_id_product_id_key']) assert.ok((await db.query('SELECT to_regclass($1) AS index',[kept])).rows[0].index);
  await db.exec('INSERT INTO wishlists VALUES(1,2,3)');
  await assert.rejects(db.exec('INSERT INTO wishlists VALUES(2,2,3)'),/unique/);
  assert.deepEqual((await db.query('SELECT * FROM registration_otps')).rows,[{id:1}]);
  if (browserRoles) {
    for (const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_table_privilege($1,'registration_otps','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role])).rows[0].allowed,false);
    await db.exec('GRANT SELECT ON registration_otps TO service_role;SET ROLE service_role');
    assert.deepEqual((await db.query('SELECT * FROM public.registration_otps')).rows,[{id:1}]);
    await db.exec('RESET ROLE');
  }
  await migration.down({ raw: sql => db.exec(sql) });
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='registration_otps'::regclass")).rows[0].relrowsecurity,true);
  // A differently-defined index is not a duplicate and must remain.
  await db.exec('CREATE INDEX idx_carts_session_id ON public.carts(id)');
  await migration.up({ raw: sql => db.exec(sql) });
  assert.ok((await db.query("SELECT to_regclass('idx_carts_session_id') AS index")).rows[0].index);
});
