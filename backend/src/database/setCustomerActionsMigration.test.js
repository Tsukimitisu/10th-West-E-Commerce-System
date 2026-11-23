import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

for (const accessHelper of [false, true]) test(`set favorites and chat references preserve product identities and deny browser access (access helper=${accessHelper})`, async t => {
  let migration;
  try { migration = require('../../migrations/202611230001_set_customer_actions.cjs'); } catch {}
  assert.ok(migration, 'set customer action migration must exist');
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE users(id int PRIMARY KEY); INSERT INTO users VALUES(1),(2);
    CREATE TABLE ecommerce_listings(id int PRIMARY KEY); INSERT INTO ecommerce_listings VALUES(7);
    CREATE TABLE wishlists(id int PRIMARY KEY,user_id int,product_id int); INSERT INTO wishlists VALUES(1,1,7);
    CREATE TABLE chat_threads(id serial PRIMARY KEY,customer_id int,product_id int,status text); INSERT INTO chat_threads(customer_id,product_id,status) VALUES(1,7,'open');`);
  if (accessHelper) await db.exec(`CREATE FUNCTION public.app_access_check() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$ SELECT current_user='service_role' $$;`);
  await migration.up({ raw: sql => db.exec(sql) });
  await migration.up({ raw: sql => db.exec(sql) });
  await db.exec(`INSERT INTO storefront_set_wishlists(user_id,listing_id,snapshot) VALUES(1,7,'{}'),(2,7,'{}');
    INSERT INTO chat_threads(customer_id,listing_id,reference_type,status) VALUES(1,7,'storefront_set','open');`);
  await assert.rejects(db.exec(`INSERT INTO storefront_set_wishlists(user_id,listing_id) VALUES(1,7)`), /unique/);
  await assert.rejects(db.exec(`INSERT INTO chat_threads(customer_id,listing_id,reference_type,status) VALUES(1,7,'storefront_set','open')`), /unique/);
  await assert.rejects(db.exec(`INSERT INTO chat_threads(customer_id,product_id,listing_id,reference_type,status) VALUES(2,7,7,'storefront_set','open')`), /check/);
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query(`SELECT has_table_privilege($1,'storefront_set_wishlists','SELECT,INSERT,UPDATE,DELETE') AS allowed`,[role])).rows[0].allowed,false);
    await db.exec(`GRANT SELECT ON storefront_set_wishlists TO ${role}; SET ROLE ${role}`);
    assert.deepEqual((await db.query('SELECT * FROM storefront_set_wishlists')).rows,[]);
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM storefront_set_wishlists')).rows[0].n,2);
  await db.exec('RESET ROLE');
  const policies = (await db.query("SELECT policyname,qual FROM pg_policies WHERE tablename='storefront_set_wishlists'")).rows;
  assert.equal(policies.length,1);assert.equal(policies[0].policyname,'backend_service_role_only');
  if(accessHelper)assert.match(policies[0].qual,/app_access_check/);
  await migration.down({ raw: sql => db.exec(sql) });
  assert.deepEqual((await db.query('SELECT * FROM wishlists')).rows,[{id:1,user_id:1,product_id:7}]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM storefront_set_wishlists')).rows[0].n,2);
});
