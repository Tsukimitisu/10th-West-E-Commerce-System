import { pathToFileURL } from 'node:url';
import { executionOptions, CONFIRMATION, inspectCleanup, cleanupWhere, assertCleanupProductionReady } from './cleanup-business-data.js';
import { loadMediaManifest, purgeBusinessMedia } from './business-media.js';

export const MEDIA_CONFIRMATION = 'PURGE_CAPTURED_BUSINESS_MEDIA';
const refused = message => Object.assign(new Error(message), { safeMessage: message });
export function mediaPurgeOptions(args, env, host, projectRef) {
  if (!args.includes('--purge-media')) throw refused('Explicit --purge-media is required.');
  if (args.includes('--execute') && !args.includes(`--confirm=${MEDIA_CONFIRMATION}`)) throw refused('Explicit PURGE_CAPTURED_BUSINESS_MEDIA confirmation is required.');
  const translated = args.filter(arg => arg !== '--purge-media').map(arg => arg === `--confirm=${MEDIA_CONFIRMATION}` ? `--confirm=${CONFIRMATION}` : arg);
  const options = executionOptions(translated, { ...env,
    CONFIRM_PRODUCTION_BUSINESS_CLEANUP: env.CONFIRM_PRODUCTION_MEDIA_PURGE === MEDIA_CONFIRMATION ? CONFIRMATION : undefined }, host, projectRef);
  if (!options.manifestPath) throw refused('A captured --manifest=...json file is required.');
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: pool } = await import('../src/config/database.js');
  let client;
  try {
    const { getDatabaseConfig } = (await import('../src/config/databaseConfig.cjs')).default;
    const projectRef = getDatabaseConfig().safeMetadata.projectRef;
    const options = mediaPurgeOptions(process.argv.slice(2), process.env, pool.options.host, projectRef);
    const manifest = await loadMediaManifest(options.manifestPath, process.env.CLOUDINARY_API_SECRET);
    client = await pool.connect();
    if (options.production) await assertCleanupProductionReady(client, options.verifiedBackupId);
    const plan = await inspectCleanup(client);
    const counts = await client.query(plan.order.map(name => `SELECT COUNT(*)::int AS count FROM public."${name}"${cleanupWhere(name)}`).join(' UNION ALL '));
    if (counts.rows.some(row => row.count > 0)) throw refused('Business data is not empty. Complete the reviewed database cleanup first; do not purge after importing new inventory.');
    let provider;
    if (options.execute) {
      const { assertCloudinaryConfigured } = await import('../src/services/cloudinary.js');
      assertCloudinaryConfigured();
      provider = (await import('cloudinary')).v2.api;
    }
    const result = await purgeBusinessMedia(client, manifest, { env: process.env, plan, targetWhere: cleanupWhere,
      provider, execute: options.execute, projectRef });
    console.log(JSON.stringify({ phase: 'media_purge', ...result }));
    if (result.failed) process.exitCode = 1;
  } catch (error) {
    // This phase NEVER rolls back an already committed database cleanup.
    console.error(error.safeMessage || 'Media purge refused or failed. Database cleanup is unaffected. Check confirmations, manifest and selected provider configuration.');
    process.exitCode = 1;
  } finally { client?.release(); await pool.end(); }
}
