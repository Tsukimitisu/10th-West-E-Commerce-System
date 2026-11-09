import { pathToFileURL } from 'node:url';
import { checkCoreDatabaseReadiness } from '../src/services/coreReadiness.js';
import { collectMediaReferences, buildMediaManifest, saveMediaManifest, mediaConfiguration } from './business-media.js';

export const CONFIRMATION = 'DELETE_BUSINESS_DATA_KEEP_USERS';
// Reviewed against the current public schema/FKs. Unknown tables fail closed.
export const cleanupTables = Object.freeze([
  'cart_items', 'carts', 'categories', 'chat_attachments', 'chat_messages', 'chat_participants', 'chat_threads',
  'discount_usages', 'discounts', 'ecommerce_listing_items', 'ecommerce_listing_media', 'ecommerce_listings',
  'motorcycle_models', 'notification_deliveries', 'notifications', 'idempotency_keys', 'order_items', 'order_status_history', 'orders',
  'payment_attempts', 'payment_events', 'payment_reconciliations', 'payments', 'pos_offline_reserves', 'pos_offline_sales',
  'pos_offline_snapshot_items', 'pos_offline_snapshots', 'product_bundle_components', 'product_fitments', 'product_images',
  'product_variants', 'product_views', 'products', 'refund_attempts', 'refunds', 'return_items', 'returns', 'reviews',
  'shipment_events', 'shipments', 'stock_adjustments', 'stock_movements', 'stock_reservations', 'store_credits',
  'subcategories', 'suppliers', 'support_tickets', 'waybills', 'wishlists',
  'banners', 'announcements',
]);
export const preservedTables = Object.freeze([
  'users', 'addresses', 'user_oauth_accounts', 'phone_verifications', 'password_reset_sms_challenges', 'registration_otps',
  'sessions', 'http_sessions', 'oauth_codes', 'device_history', 'login_attempts', 'request_rate_limits',
  'permissions', 'role_permissions', 'user_permissions', 'system_settings', 'system_cleanup_status',
  'knex_migrations', 'knex_migrations_lock', 'audit_logs', 'activity_logs', 'error_logs',
  'backup_history', 'backup_records', 'backup_scheduler', 'database_restore_jobs', 'recovery_control',
  'pos_offline_devices', 'pos_offline_device_requests', 'shipping_rates', 'chat_quick_replies',
  'faqs', 'policies',
]);
const transactionNotification = `COALESCE(reference_type,'') IN ('order','return','refund','payment','shipment','product','inventory','chat','conversation')
  OR COALESCE(type,'') ~ '^(order|return|refund|payment|shipment|product|inventory|stock|chat)([._]|$)'
  OR metadata ?| ARRAY['order_id','return_id','refund_id','payment_id','product_id','conversation_id','thread_id']`;
const filters = {
  notifications: transactionNotification,
  notification_deliveries: `notification_id IN (SELECT id FROM public.notifications WHERE COALESCE((${transactionNotification}),false))`,
  idempotency_keys: "COALESCE(scope,'') ~ '^(checkout|pos|order|return|refund|payment)([.:_]|$)'",
  store_credits: "COALESCE(reference_type,'') IN ('order','return','refund')",
};
const quote = value => `"${value.replaceAll('"', '""')}"`;
const tableSql = name => `public.${quote(name)}`;
export const cleanupWhere = name => filters[name] ? ` WHERE COALESCE((${filters[name]}),false)` : '';
const where = cleanupWhere;
const refused = message => Object.assign(new Error(message), { safeMessage: message });

export function executionOptions(args, env, host, projectRef) {
  const allowed = ['--execute', '--dry-run', '--production', '--backup-verified', '--writers-paused', '--pos-sync-stopped', `--confirm=${CONFIRMATION}`];
  const paths = args.filter(arg => arg.startsWith('--manifest='));
  if (args.some(arg => !allowed.includes(arg) && !arg.startsWith('--manifest=')) || paths.length > 1 || (args.includes('--execute') && args.includes('--dry-run'))) throw refused('Invalid cleanup options. Default is dry run.');
  const execute = args.includes('--execute');
  const remote = !['localhost', '127.0.0.1', '::1'].includes(String(host || '').toLowerCase());
  if (execute && !args.includes(`--confirm=${CONFIRMATION}`)) throw refused('Explicit cleanup confirmation is required.');
  if (execute && (remote || env.NODE_ENV === 'production' || args.includes('--production'))
    && (!args.includes('--production') || env.CONFIRM_PRODUCTION_BUSINESS_CLEANUP !== CONFIRMATION)) {
    throw refused('Remote/production cleanup requires --production and CONFIRM_PRODUCTION_BUSINESS_CLEANUP.');
  }
  const production = execute && (remote || env.NODE_ENV === 'production' || args.includes('--production'));
  if (production && (!projectRef || env.CLEANUP_PRODUCTION_PROJECT_REF !== projectRef || !env.CLEANUP_VERIFIED_BACKUP_ID
    || !['--backup-verified','--writers-paused','--pos-sync-stopped'].every(flag => args.includes(flag)))) {
    throw refused('Confirm the exact production project, verified backup ID, paused writers and stopped POS sync.');
  }
  const manifestPath = paths[0]?.slice('--manifest='.length);
  if (execute && !manifestPath) throw refused('Execution requires a new --manifest=...json file to capture media before deleting database rows.');
  return { execute, production, ...(manifestPath ? { manifestPath } : {}), ...(production ? { verifiedBackupId: env.CLEANUP_VERIFIED_BACKUP_ID } : {}) };
}

export async function assertCleanupProductionReady(db, verifiedBackupId) {
  const maintenance = await db.query("SELECT value FROM public.system_settings WHERE category='system' AND key='maintenance_mode'");
  if (String(maintenance.rows[0]?.value) !== 'true') throw refused('Enable Super Admin maintenance and pause external/background writers before production cleanup.');
  const backup = await db.query(`SELECT id FROM public.backup_records WHERE id=$1 AND status='completed' AND encrypted=true
    AND deleted_at IS NULL AND size_bytes>0 AND checksum ~ '^[a-fA-F0-9]{64}$'
    AND completed_at BETWEEN NOW()-INTERVAL '24 hours' AND NOW()`, [verifiedBackupId || null]);
  if (!backup.rows.length) throw refused('A verified, completed encrypted backup from the last 24 hours is required.');
}

export async function inspectCleanup(db) {
  const tables = (await db.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.relacl::text AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  const known = new Set([...cleanupTables, ...preservedTables]);
  const unknown = tables.filter(table => !known.has(table.name));
  if (unknown.length) throw refused(`Unreviewed public tables: ${unknown.map(table => table.name).join(', ')}. Review scope first.`);
  if (!tables.some(table => table.name === 'users')) throw refused('Users table is required.');
  if (tables.some(table => !table.rls)) throw refused('RLS verification failed: public tables without RLS.');
  const policies = (await db.query("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows;
  const grants = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))`);
  if (grants.rows.length) throw refused('Browser/PUBLIC table grants must be secured before cleanup.');
  const fks = (await db.query(`SELECT child_ns.nspname AS child_schema,child.relname AS child,parent.relname AS parent,con.confdeltype AS on_delete
    FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
    WHERE con.contype='f' AND parent_ns.nspname='public' ORDER BY child_ns.nspname,child.relname,parent.relname,con.conname`)).rows;
  const targets = tables.map(table => table.name).filter(name => cleanupTables.includes(name));
  for (const fk of fks) {
    if (targets.includes(fk.parent) && (fk.child_schema !== 'public' || !targets.includes(fk.child))) {
      throw refused(`Preserved/unreviewed table ${fk.child_schema}.${fk.child} references cleanup table ${fk.parent}. Review scope first.`);
    }
  }
  // Nullable SET NULL/DEFAULT edges do not constrain delete order (chat has a
  // thread/last-message cycle). Other edges require child-before-parent.
  const remaining = new Set(targets), order = [];
  while (remaining.size) {
    const next = [...remaining].find(parent => !fks.some(fk => fk.parent === parent && fk.child !== parent
      && remaining.has(fk.child) && !['n', 'd'].includes(fk.on_delete)));
    if (!next) throw refused('Cleanup has a restrictive foreign-key cycle. Review it before execution.');
    order.push(next); remaining.delete(next);
  }
  return { tables, order, security: JSON.stringify({ tables, policies, fks }) };
}

async function fingerprints(db, names, untouchedOnly = false) {
  if (!names.length) return [];
  return (await db.query(names.map(name => `SELECT '${name}' AS table_name,COUNT(*)::int AS count,
    md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) AS fingerprint
    FROM ${tableSql(name)} t${untouchedOnly ? ` WHERE NOT COALESCE((${filters[name]}),false)` : ''}`).join(' UNION ALL '))).rows.sort((a,b) => a.table_name.localeCompare(b.table_name));
}

export async function cleanupBusinessData(db, { execute = false, production = false, log = console.log,
  mediaEnv = process.env, projectRef = null, persistManifest, verifiedBackupId } = {}) {
  // Read committed takes a fresh data snapshot AFTER all write locks are held;
  // a pre-lock repeatable snapshot could miss a just-committed business row.
  await db.query(execute ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let committed = false;
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    let plan = await inspectCleanup(db);
    if (execute) {
      // Stop concurrent writes and cascade surprises; reads/health remain available.
      await db.query(`LOCK TABLE ${plan.tables.map(table => tableSql(table.name)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
      plan = await inspectCleanup(db);
      if (production) await assertCleanupProductionReady(db, verifiedBackupId);
    }
    await checkCoreDatabaseReadiness(db);
    const counts = plan.order.length ? (await db.query(plan.order.map(name => `SELECT '${name}' AS table_name,COUNT(*)::int AS rows_to_delete FROM ${tableSql(name)}${where(name)}`).join(' UNION ALL '))).rows : [];
    const userCount = Number((await db.query('SELECT COUNT(*)::int AS count FROM public.users')).rows[0].count);
    const creditAccounts = Number((await db.query('SELECT COUNT(*)::int AS count FROM public.users WHERE COALESCE(store_credit,0) <> 0')).rows[0].count);
    const report = { mode: execute ? 'execute' : 'dry_run', users_preserved: userCount, tables: counts,
      total_rows: counts.reduce((sum, row) => sum + row.rows_to_delete, 0), blocking_store_credit_accounts: creditAccounts,
      sequences_reset: false };
    log(JSON.stringify({ phase: 'before', ...report }));
    const manifest = buildMediaManifest(await collectMediaReferences(db, plan, where), mediaEnv, projectRef);
    log(JSON.stringify({ phase: 'media_plan', selected: manifest.assets, manual_review: manifest.manual_review.map(({ reference_url, ...safe }) => safe),
      preserved: manifest.preserved, retained_reference_count: manifest.retained_reference_count }));
    if (!execute) {
      if (persistManifest) await persistManifest({ ...manifest, status: 'dry_run' }, true);
      await db.query('ROLLBACK'); return { ...report, media: manifest };
    }
    if (creditAccounts) throw refused('Reconcile nonzero user store-credit balances before removing transaction credits; users will not be modified.');
    if (!persistManifest || !mediaConfiguration(mediaEnv) || !projectRef) throw refused('A durable media manifest, Cloudinary root/cloud and target project reference are required.');
    await persistManifest(manifest, true); // Failure here aborts BEFORE any deletion.
    const kept = plan.tables.map(table => table.name).filter(name => preservedTables.includes(name));
    const selective = plan.order.filter(name => filters[name]);
    const before = await fingerprints(db, kept), beforeSelective = await fingerprints(db, selective, true);
    for (const name of plan.order) await db.query(`DELETE FROM ${tableSql(name)}${where(name)}`);
    const after = await fingerprints(db, kept), afterSelective = await fingerprints(db, selective, true);
    if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(beforeSelective) !== JSON.stringify(afterSelective)) {
      throw refused('Preserved account/configuration/history rows changed; cleanup rolled back.');
    }
    for (const name of plan.order) {
      if (Number((await db.query(`SELECT COUNT(*)::int AS count FROM ${tableSql(name)}${where(name)}`)).rows[0].count)) throw refused('Cleanup verification failed; targeted rows remain.');
    }
    if ((await inspectCleanup(db)).security !== plan.security) throw refused('Schema/RLS changed; cleanup rolled back.');
    await checkCoreDatabaseReadiness(db);
    await db.query('COMMIT');
    committed = true;
    log(JSON.stringify({ phase: 'after', status: 'completed', users_preserved: userCount, preserved_rows_unchanged: true,
      targeted_rows_remaining: 0, schema_rls_unchanged: true, core_ready: true, sequences_reset: false }));
    const committedManifest = { ...manifest, status: 'database_committed', committed_at: new Date().toISOString() };
    await persistManifest(committedManifest, false);
    return { ...report, completed: true, media: committedManifest };
  } catch (error) {
    if (committed) throw refused('Database cleanup COMMITTED, but the media manifest could not be finalized. No media purge ran. Keep maintenance on and recover the prepared manifest; the database was NOT rolled back.');
    await db.query('ROLLBACK').catch(() => {}); throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Importing this module in tests cannot open the configured production DB.
  const { default: pool } = await import('../src/config/database.js');
  let client;
  try {
    const { getDatabaseConfig } = (await import('../src/config/databaseConfig.cjs')).default;
    const projectRef = getDatabaseConfig().safeMetadata.projectRef;
    const options = executionOptions(process.argv.slice(2), process.env, pool.options.host, projectRef);
    client = await pool.connect();
    await cleanupBusinessData(client, { ...options, projectRef,
      persistManifest: options.manifestPath ? (manifest, create) => saveMediaManifest(options.manifestPath, manifest, process.env.CLOUDINARY_API_SECRET, { create }) : undefined });
  } catch (error) {
    console.error(error.safeMessage || 'Business cleanup failed or rolled back. No database error details are printed.');
    process.exitCode = 1;
  } finally { client?.release(); await pool.end(); }
}
