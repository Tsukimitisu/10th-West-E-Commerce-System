import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { cleanupBusinessData, cleanupTables, preservedTables, executionOptions, CONFIRMATION } from './cleanup-business-data.js';
import lockdown from '../migrations/202607030001_lock_down_supabase_rls.cjs';
import schemaLockdown from '../migrations/202607030002_revoke_public_schema_access.cjs';

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  const columns = {
    users: "password_hash text,store_credit numeric DEFAULT 0,is_active boolean DEFAULT true,is_deleted boolean DEFAULT false,two_factor_enabled boolean DEFAULT true,two_factor_secret text",
    http_sessions: 'sid text,sess json,expire timestamptz',
    products: 'category_id int REFERENCES categories(id),stock_quantity int DEFAULT 5,reserved_stock int DEFAULT 0',
    product_variants: 'product_id int REFERENCES products(id)',
    orders: "user_id int REFERENCES users(id),status text DEFAULT 'delivered',payment_status text DEFAULT 'paid'",
    order_items: 'order_id int REFERENCES orders(id),product_id int REFERENCES products(id)',
    payments: 'order_id int REFERENCES orders(id) ON DELETE RESTRICT,user_id int REFERENCES users(id)',
    returns: 'order_id int REFERENCES orders(id)',
    refunds: 'return_id int REFERENCES returns(id)',
    return_items: 'return_id int REFERENCES returns(id),order_item_id int REFERENCES order_items(id)',
    discounts: 'code text',
    discount_usages: 'discount_id int REFERENCES discounts(id) ON DELETE RESTRICT,order_id int REFERENCES orders(id)',
    notifications: 'type text,reference_type text,metadata jsonb',
    notification_deliveries: 'notification_id int REFERENCES notifications(id) ON DELETE CASCADE',
    idempotency_keys: 'scope text',
    store_credits: 'reference_type text,user_id int REFERENCES users(id)',
    pos_offline_devices: 'device_uuid uuid UNIQUE,is_active boolean DEFAULT true',
    pos_offline_device_requests: 'approved_device_id int REFERENCES pos_offline_devices(id)',
    pos_offline_reserves: 'device_id int REFERENCES pos_offline_devices(id),product_id int REFERENCES products(id) ON DELETE RESTRICT',
    pos_offline_snapshots: 'device_id int REFERENCES pos_offline_devices(id)',
    pos_offline_snapshot_items: 'snapshot_id int REFERENCES pos_offline_snapshots(id)',
    pos_offline_sales: 'snapshot_id int REFERENCES pos_offline_snapshots(id),order_id int REFERENCES orders(id),device_id int REFERENCES pos_offline_devices(id)',
    chat_threads: 'last_message_id int',
    chat_messages: 'conversation_id int REFERENCES chat_threads(id) ON DELETE CASCADE',
    system_settings: 'category text,key text,value text',
    user_oauth_accounts: 'user_id int REFERENCES users(id),provider text,provider_user_id text',
  };
  // Create actual dependency parents first. All other reviewed tables are
  // represented too, so a missing core relation cannot produce a false pass.
  const priority = ['users','categories','products','product_variants','orders','order_items','payments','returns','refunds',
    'discounts','notifications','pos_offline_devices','pos_offline_snapshots','chat_threads'];
  for (const name of [...priority, ...new Set([...preservedTables, ...cleanupTables])].filter((name, index, names) => names.indexOf(name) === index)) {
    await db.exec(`CREATE TABLE public.${name}(id serial PRIMARY KEY${columns[name] ? `,${columns[name]}` : ''});`);
  }
  await db.exec('ALTER TABLE chat_threads ADD FOREIGN KEY(last_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL');
  for (const name of [...new Set([...preservedTables, ...cleanupTables])]) await db.query(`INSERT INTO public.${name}(id) VALUES(1)`);
  const password = await bcrypt.hash('Synthetic-test-password-9!', 10);
  await db.query('UPDATE users SET password_hash=$1,two_factor_secret=$2 WHERE id=1', [password, 'synthetic-encrypted-secret']);
  await db.exec(`INSERT INTO users(id,password_hash,two_factor_enabled) VALUES(2,NULL,false);
    UPDATE user_oauth_accounts SET user_id=2,provider='google',provider_user_id='synthetic-provider-id';
    UPDATE products SET category_id=1; UPDATE product_variants SET product_id=1;
    UPDATE orders SET user_id=1; UPDATE order_items SET order_id=1,product_id=1;
    UPDATE payments SET order_id=1,user_id=1; UPDATE returns SET order_id=1;
    UPDATE refunds SET return_id=1; UPDATE return_items SET return_id=1,order_item_id=1;
    UPDATE discounts SET code='OWNER_TEST'; UPDATE discount_usages SET discount_id=1,order_id=1;
    UPDATE pos_offline_devices SET device_uuid='11111111-1111-4111-8111-111111111111';
    UPDATE pos_offline_device_requests SET approved_device_id=1;
    UPDATE pos_offline_reserves SET device_id=1,product_id=1;
    UPDATE pos_offline_snapshots SET device_id=1; UPDATE pos_offline_snapshot_items SET snapshot_id=1;
    UPDATE pos_offline_sales SET device_id=1,snapshot_id=1,order_id=1;
    UPDATE chat_messages SET conversation_id=1; UPDATE chat_threads SET last_message_id=1;
    UPDATE notifications SET type='order_status',reference_type='order';
    INSERT INTO notifications(id,type,reference_type) VALUES(2,'security.alert','account');
    UPDATE notification_deliveries SET notification_id=1; INSERT INTO notification_deliveries(id,notification_id) VALUES(2,2);
    UPDATE idempotency_keys SET scope='checkout'; INSERT INTO idempotency_keys(id,scope) VALUES(2,'account.delete');
    UPDATE store_credits SET reference_type='return',user_id=1; INSERT INTO store_credits(id,reference_type,user_id) VALUES(2,'manual',1);
    UPDATE system_settings SET category='system',key='maintenance_mode',value='true';`);
  await lockdown.up({ raw: sql => db.exec(sql) });
  await schemaLockdown.up({ raw: sql => db.exec(sql) });
  return db;
}

test('cleanup defaults to dry run and reports FK-reviewed counts without changing data', async t => {
  const db = await fixture(t), logs = [];
  const report = await cleanupBusinessData(db, { log: value => logs.push(value) });
  assert.equal(report.mode, 'dry_run'); assert.equal(report.users_preserved, 2);
  assert.equal(report.tables.find(row => row.table_name === 'products').rows_to_delete, 1);
  assert.equal(report.tables.find(row => row.table_name === 'notifications').rows_to_delete, 1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM products')).rows[0].count, 1);
  assert.doesNotMatch(logs.join(''), /password_hash|Synthetic-test|two_factor_secret|synthetic-encrypted-secret/);
});

test('disposable PostgreSQL cleanup removes business data, preserves all users/auth/config/RLS and keeps readiness', async t => {
  const db = await fixture(t), logs = [];
  const before = (await db.query('SELECT * FROM users ORDER BY id')).rows;
  const result = await cleanupBusinessData(db, { execute: true, production: true, log: value => logs.push(value) });
  assert.equal(result.completed, true);
  assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows, before);
  assert.equal(await bcrypt.compare('Synthetic-test-password-9!', before[0].password_hash), true);
  for (const name of ['products','product_variants','orders','order_items','payments','discounts','discount_usages','pos_offline_sales','pos_offline_reserves','chat_threads','chat_messages','refunds']) {
    assert.equal((await db.query(`SELECT COUNT(*)::int AS count FROM ${name}`)).rows[0].count, 0, name);
  }
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM user_oauth_accounts')).rows[0].count, 1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM knex_migrations')).rows[0].count, 1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM pos_offline_devices WHERE is_active')).rows[0].count, 1);
  assert.deepEqual((await db.query('SELECT id FROM notifications')).rows, [{ id: 2 }]);
  assert.deepEqual((await db.query('SELECT id FROM notification_deliveries')).rows, [{ id: 2 }]);
  assert.deepEqual((await db.query('SELECT scope FROM idempotency_keys')).rows, [{ scope: 'account.delete' }]);
  assert.deepEqual((await db.query('SELECT reference_type FROM store_credits')).rows, [{ reference_type: 'manual' }]);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")).rows[0].count, 0);
  assert.match(logs.at(-1), /"core_ready":true/);
  assert.match(logs.at(-1), /"preserved_rows_unchanged":true/);
});

test('failure during deletion rolls the entire cleanup back', async t => {
  const db = await fixture(t);
  await db.exec(`CREATE FUNCTION fail_test_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER test_cleanup_failure BEFORE DELETE ON products FOR EACH ROW EXECUTE FUNCTION fail_test_cleanup();`);
  await assert.rejects(cleanupBusinessData(db, { execute: true, log() {} }), /synthetic failure/);
  for (const name of ['users','products','orders','payments','discounts','pos_offline_sales']) {
    assert.ok((await db.query(`SELECT COUNT(*)::int AS count FROM ${name}`)).rows[0].count > 0, name);
  }
});

test('cleanup refuses unreviewed dependencies, unsecured tables and credit-balance inconsistencies', async t => {
  const db = await fixture(t);
  await db.exec('CREATE TABLE future_business_table(id int REFERENCES products(id))');
  await assert.rejects(cleanupBusinessData(db, { execute: true, log() {} }), /Unreviewed public tables/);
  await db.exec('DROP TABLE future_business_table; ALTER TABLE products DISABLE ROW LEVEL SECURITY;');
  await assert.rejects(cleanupBusinessData(db, { execute: true, log() {} }), /without RLS/);
  await db.exec('ALTER TABLE products ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs ADD COLUMN product_id int REFERENCES products(id) ON DELETE CASCADE;');
  await assert.rejects(cleanupBusinessData(db, { execute: true, log() {} }), /Preserved\/unreviewed table/);
  await db.exec('ALTER TABLE audit_logs DROP COLUMN product_id; UPDATE users SET store_credit=20');
  await assert.rejects(cleanupBusinessData(db, { execute: true, log() {} }), /Reconcile nonzero/);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM products')).rows[0].count, 1);
});

test('execution requires explicit flags and remote production environment confirmation', () => {
  assert.deepEqual(executionOptions([], {}, 'remote.example.test'), { execute: false, production: false });
  assert.throws(() => executionOptions(['--execute'], {}, 'localhost'), /confirmation/);
  assert.throws(() => executionOptions(['--execute', `--confirm=${CONFIRMATION}`], {}, 'remote.example.test'), /Remote\/production/);
  assert.throws(() => executionOptions(['--execute', '--production', `--confirm=${CONFIRMATION}`], {}, 'remote.example.test'), /Remote\/production/);
  assert.deepEqual(executionOptions(['--execute', '--production', `--confirm=${CONFIRMATION}`], { CONFIRM_PRODUCTION_BUSINESS_CLEANUP: CONFIRMATION }, 'remote.example.test'), { execute: true, production: true });
  assert.throws(() => executionOptions(['--execute', '--dry-run'], {}, 'localhost'), /Invalid/);
});
