import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import migration from '../../migrations/202611100002_backend_policies_and_fk_indexes.cjs';
import lockdown from '../../migrations/202607030001_lock_down_supabase_rls.cjs';
import schemaLockdown from '../../migrations/202607030002_revoke_public_schema_access.cjs';

const foreignKeys = JSON.parse(await readFile(new URL('./fixtures/advisorForeignKeys.json',import.meta.url),'utf8'));
const targets = ['backup_records','backup_scheduler','password_reset_sms_challenges','phone_verifications',
  'pos_offline_device_requests','pos_offline_devices','pos_offline_reserves','pos_offline_sales',
  'pos_offline_snapshot_items','pos_offline_snapshots'].map(table => ['public',table])
  .concat([['recovery_control','database_restore_jobs'],['recovery_control','state']]);
const quote = name => '"' + name.replaceAll('"','""') + '"';
const apply = async db => {
  await db.exec('BEGIN');
  try { await migration.up({ raw: sql => db.exec(sql) }); await db.exec('COMMIT'); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
};

async function fixture(t, roles = false) {
  const db = new PGlite(); t.after(() => db.close());
  if (roles) await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role NOBYPASSRLS;');
  await db.exec('CREATE SCHEMA recovery_control;CREATE TABLE public.fk_parent(id int PRIMARY KEY);INSERT INTO public.fk_parent VALUES(1);');
  const tables = new Map(targets.map(([schema,table]) => [`${schema}.${table}`,new Set()]));
  for (const fk of foreignKeys) {
    const key = `${fk.schema}.${fk.table}`;
    if (!tables.has(key)) tables.set(key,new Set());
    fk.columns.forEach(column => tables.get(key).add(column));
  }
  for (const [table,columns] of tables) {
    await db.exec(`CREATE TABLE ${table}(id int PRIMARY KEY,payload text DEFAULT 'preserved'
      ${[...columns].map(column => `,${quote(column)} int REFERENCES public.fk_parent(id)`).join('')});INSERT INTO ${table}(id) VALUES(1);`);
  }
  await db.exec(`CREATE TABLE public.oauth_codes(id int PRIMARY KEY,code_hash text UNIQUE);
    INSERT INTO public.oauth_codes VALUES(1,'synthetic-hash');CREATE INDEX idx_oauth_codes_hash ON public.oauth_codes(code_hash);
    CREATE TABLE public.fk_pair_parent(a int,b int,PRIMARY KEY(a,b));
    CREATE TABLE public.fk_covered(id int PRIMARY KEY,a int,b int,tag text,FOREIGN KEY(a,b) REFERENCES public.fk_pair_parent(a,b));
    CREATE INDEX existing_reordered_prefix ON public.fk_covered(b,a,tag) INCLUDE(id);
    CREATE TABLE public.fk_include(a int,b int,FOREIGN KEY(a,b) REFERENCES public.fk_pair_parent(a,b));
    CREATE INDEX only_included ON public.fk_include(a) INCLUDE(b);
    CREATE TABLE public.fk_partial(parent_id int REFERENCES public.fk_parent(id));CREATE INDEX only_partial ON public.fk_partial(parent_id) WHERE parent_id IS NOT NULL;
    CREATE TABLE public.fk_expression(parent_id int REFERENCES public.fk_parent(id));CREATE INDEX only_expression ON public.fk_expression((parent_id+0));
    CREATE TABLE public.fk_wrong_prefix(other int,parent_id int REFERENCES public.fk_parent(id));CREATE INDEX wrong_prefix ON public.fk_wrong_prefix(other,parent_id);
    CREATE TABLE public.fk_twins(parent_id int REFERENCES public.fk_parent(id),FOREIGN KEY(parent_id) REFERENCES public.fk_parent(id));
    CREATE TABLE public.long_offline_inventory_foreign_key_coverage_fixture(long_parent_reference_identifier int REFERENCES public.fk_parent(id));`);
  await lockdown.up({ raw: sql => db.exec(sql) });
  await schemaLockdown.up({ raw: sql => db.exec(sql) });
  for (const [schema,table] of targets) {
    await db.exec(`ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY;DROP POLICY IF EXISTS backend_service_role_only ON ${schema}.${table};`);
    // Simulate accidental historic grants: the migration must revoke these too.
    await db.exec(`GRANT ALL ON ${schema}.${table} TO PUBLIC;`);
    if (roles) await db.exec(`GRANT ALL ON ${schema}.${table} TO anon,authenticated,service_role;`);
  }
  if (roles) await db.exec('GRANT USAGE ON SCHEMA recovery_control TO anon,authenticated,service_role;');
  return db;
}

for (const roles of [false,true]) test(`explicit backend policies and FK coverage preserve all data/constraints (Supabase roles=${roles})`,async t => {
  const db = await fixture(t,roles);
  const constraints = () => db.query("SELECT conrelid::regclass::text AS object,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'recovery_control'::regnamespace) ORDER BY 1,2");
  const before = (await constraints()).rows;
  await apply(db);
  const indexes = (await db.query('SELECT indexname,indexdef FROM pg_indexes WHERE schemaname IN (\'public\',\'recovery_control\') ORDER BY indexname')).rows;
  await apply(db);
  await migration.down({ raw: sql => db.exec(sql) });
  assert.deepEqual((await constraints()).rows,before);
  assert.deepEqual((await db.query('SELECT indexname,indexdef FROM pg_indexes WHERE schemaname IN (\'public\',\'recovery_control\') ORDER BY indexname')).rows,indexes);
  for (const [schema,table] of targets) {
    const qualified = `${schema}.${table}`;
    const policies = (await db.query('SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname=$1 AND tablename=$2',[schema,table])).rows;
    assert.equal(policies.length,1); assert.equal(policies[0].policyname,'backend_service_role_only');
    assert.equal(policies[0].cmd,'ALL'); assert.match(policies[0].qual,/SELECT[\s\S]*app_access_check/);
    assert.match(policies[0].with_check,/SELECT[\s\S]*app_access_check/);
    assert.deepEqual((await db.query(`SELECT id,payload FROM ${qualified}`)).rows,[{id:1,payload:'preserved'}]);
    const publicGrants = await db.query('SELECT 1 FROM pg_class c,LATERAL aclexplode(c.relacl) acl WHERE c.oid=$1::regclass AND acl.grantee=0',[qualified]);
    assert.equal(publicGrants.rows.length,0);
    if (roles) {
      for (const role of ['anon','authenticated']) {
        assert.equal((await db.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') AS allowed',[role,qualified])).rows[0].allowed,false);
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query(`SELECT * FROM ${qualified}`),/permission denied/);
        await db.exec('RESET ROLE');
      }
      // A non-bypass service role exercises the policy itself, not owner bypass.
      await db.exec('SET ROLE service_role');
      await db.exec(`INSERT INTO ${qualified}(id,payload) VALUES(2,'backend write');UPDATE ${qualified} SET payload='backend update' WHERE id=2;DELETE FROM ${qualified} WHERE id=2;`);
      assert.equal((await db.query(`SELECT * FROM ${qualified}`)).rows.length,1);
      await db.exec('RESET ROLE');
    }
  }
  // Every captured uncovered FK received an actual leading-column B-tree.
  for (const fk of foreignKeys) {
    const definition = indexes.find(i => i.indexname === `idx_fk_${fk.table}_${fk.columns.join('_')}`)?.indexdef;
    assert.ok(definition,`${fk.table}.${fk.columns} must have an FK index`);
    assert.ok(definition.endsWith(`(${fk.columns.join(', ')})`));
  }
  assert.equal(indexes.filter(i => i.indexname.startsWith('idx_fk_fk_covered')).length,0,'reuse reordered composite left prefix');
  for (const table of ['include','partial','expression','wrong_prefix','twins']) assert.equal(indexes.filter(i => i.indexname.startsWith(`idx_fk_fk_${table}_`)).length,1);
  assert.ok(indexes.every(i => Buffer.byteLength(i.indexname)<=63));
  assert.equal(indexes.some(i => i.indexname==='idx_oauth_codes_hash'),false);
  assert.equal(indexes.some(i => i.indexname==='oauth_codes_code_hash_key'),true);
  await assert.rejects(db.exec("INSERT INTO public.oauth_codes VALUES(2,'synthetic-hash')"),/unique/);
  assert.deepEqual((await db.query("SELECT * FROM public.oauth_codes")).rows,[{id:1,code_hash:'synthetic-hash'}]);
  // Exercise the exact security verifier against the disposable schema.
  const verifier = await readFile(new URL('../../scripts/verify-rls.js',import.meta.url),'utf8');
  for (const name of ['unsafePolicies','tablesWithoutRls']) {
    const query = verifier.match(new RegExp(`const ${name} = await pool\\.query\\(\x60([\\s\\S]*?)\x60\\);`));
    assert.ok(query);assert.deepEqual((await db.query(query[1])).rows,[]);
  }
  const grantsSql = verifier.match(/const grants = await pool\.query\(\s*`([\s\S]*?)`/)[1];
  const schemaSql = verifier.match(/const schemaGrants = await pool\.query\(\s*`([\s\S]*?)`/)[1];
  assert.deepEqual((await db.query(grantsSql,[['PUBLIC','anon','authenticated']])).rows,[]);
  assert.deepEqual((await db.query(schemaSql,[['anon','authenticated']])).rows,[]);
  await db.exec('GRANT SELECT ON public.fk_parent TO PUBLIC');
  assert.equal((await db.query(grantsSql,[['PUBLIC','anon','authenticated']])).rows.length,1,'verifier must detect inherited PUBLIC grants');
  await db.exec('REVOKE ALL ON public.fk_parent FROM PUBLIC');
  const duplicates = await db.query(`SELECT indrelid,indkey::text,indclass::text,pg_get_expr(indpred,indrelid),count(*)
    FROM pg_index GROUP BY 1,2,3,4 HAVING count(*)>1`);
  assert.deepEqual(duplicates.rows,[],'no equivalent indexes introduced');
});

test('unexpected policies abort transaction; differently defined OAuth index is retained',async t => {
  const db = await fixture(t);
  await db.exec('CREATE POLICY unexpected_policy ON public.backup_records USING(false)');
  await assert.rejects(apply(db),/Review unexpected policies/);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_indexes WHERE indexname LIKE 'idx_fk_%'")).rows[0].count,0);
  await db.exec('DROP POLICY unexpected_policy ON public.backup_records;DROP INDEX public.idx_oauth_codes_hash;CREATE INDEX idx_oauth_codes_hash ON public.oauth_codes(id,code_hash);');
  await apply(db);
  assert.ok((await db.query("SELECT to_regclass('public.idx_oauth_codes_hash') AS index")).rows[0].index);
});
