import { randomUUID } from 'node:crypto';
import { readMaintenance } from './maintenanceControl.js';
import { cleanupStatus } from './maintenance.js';
import { getEmailConfigurationStatus } from './integrationReadiness.js';
import { inspectResendConfiguration } from './transactionalEmail.js';
import { getPaymongoConfigurationStatus } from './paymongo.js';

// Explicit allowlist: this payload is also safe to copy to a support request.
export async function operationsStatus(db, env = process.env) {
  const checks = await Promise.allSettled([
    readMaintenance(db), cleanupStatus(db, { env }), db.query('SELECT 1'),
    db.query("SELECT MAX(completed_at) FILTER (WHERE status='completed') AS last_success, MAX(created_at) FILTER (WHERE status='failed') AS last_failure FROM backup_records WHERE deleted_at IS NULL"),
    db.query("SELECT COUNT(*)::integer AS count FROM error_logs WHERE created_at >= NOW()-INTERVAL '24 hours'"),
  ]);
  const value = (i, fallback) => checks[i].status === 'fulfilled' ? checks[i].value : fallback;
  const maintenance = value(0, null);
  if (maintenance?.started_by) {
    try { maintenance.started_by_name = (await db.query('SELECT name FROM users WHERE id=$1', [maintenance.started_by])).rows[0]?.name || null; }
    catch { maintenance.started_by_name = null; maintenance.started_by_unavailable = true; }
  }
  const cleanup = value(1, { status: 'unavailable', last_cleanup: null, last_result: null, next_expected_run: null, last_counts: null });
  const backup = value(3, { rows: [] }).rows[0] || {};
  const backupStatus = checks[3].status === 'rejected' ? 'unavailable' : !backup.last_success ? 'not_captured'
    : backup.last_failure && new Date(backup.last_failure) > new Date(backup.last_success) ? 'needs_attention' : 'successful';
  const emailConfig = getEmailConfigurationStatus();
  const emailReady = emailConfig.ready && (emailConfig.provider !== 'resend' || inspectResendConfiguration(env).ready);
  const paymentsReady = getPaymongoConfigurationStatus().configured;
  const errors = value(4, { rows: [] }).rows[0]?.count;
  const database = checks[2].status === 'fulfilled' ? 'connected' : 'unavailable';
  const diagnostics = {
    reference: randomUUID(), timestamp: new Date().toISOString(), application: '10th West',
    ...( /^[a-f\d]{7,40}$/i.test(env.RENDER_GIT_COMMIT || env.APP_COMMIT || '') ? { commit: (env.RENDER_GIT_COMMIT || env.APP_COMMIT).slice(0, 12) } : {}),
    overall: database === 'unavailable' ? 'unavailable' : !emailReady || !paymentsReady || cleanup.status !== 'healthy' || backupStatus !== 'successful' || !maintenance || errors == null || errors > 0 ? 'needs_attention' : 'healthy',
    website: 'online', database,
    email: emailReady ? 'configured' : 'needs_attention', payments: paymentsReady ? 'configured' : 'needs_attention',
    integration_check: 'Configuration checked. Email delivery and new payments were not tested.',
    backup: { status: backupStatus, time: backup.last_success || null },
    cleanup: { status: cleanup.status, time: cleanup.last_cleanup || null },
    recent_errors_24h: Number.isInteger(Number(errors)) && errors != null ? Number(errors) : null,
    maintenance: maintenance ? maintenance.active ? 'active' : 'inactive' : 'unavailable',
  };
  return { maintenance, cleanup, diagnostics };
}
