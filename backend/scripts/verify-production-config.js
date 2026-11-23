import '../src/config/environment.cjs';
import { validateCoreEnvironment } from '../src/config/productionConfig.js';
import { validateDeploymentUrls } from '../src/config/deployment.js';
import { phoneOtpConfig, phoneProvider } from '../src/services/phoneOtp.js';
import databaseConfig from '../src/config/databaseConfig.cjs';
import { pathToFileURL } from 'node:url';
import { inspectResendConfiguration } from '../src/services/transactionalEmail.js';
import { backupConfig, encryptionKey } from '../src/services/backupConfig.js';

export const inspectProductionEmailConfig = (env) => {
  const failures = [];
  if (String(env.EMAIL_PROVIDER || '').trim().toLowerCase() !== 'resend') {
    failures.push('EMAIL_PROVIDER must be resend');
  }
  failures.push(...inspectResendConfiguration({ ...env, NODE_ENV: 'production' }).failures);
  if (!String(env.FRONTEND_ORIGIN || env.FRONTEND_URL || '').trim()) failures.push('FRONTEND_ORIGIN or FRONTEND_URL required for email links');
  for (const name of ['FRONTEND_ORIGIN', 'FRONTEND_URL']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== 'https:' || url.username || url.password
        || ['localhost', '[::1]', '0.0.0.0'].includes(url.hostname)
        || /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new Error();
    } catch { failures.push(`${name} must be a public HTTPS frontend origin`); }
  }
  return { ready: failures.length === 0, failures };
};

export const inspectProductionConfig = (env) => {
  const failures = [];
  const check = (name, operation) => { try { operation(); } catch { failures.push(name); } };
  if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
  for (const name of [
    'DATABASE_URL', 'FRONTEND_ORIGIN', 'FRONTEND_URL', 'BACKEND_URL',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL',
    'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_CALLBACK_URL',
    'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET',
    'PAYMONGO_SUCCESS_URL', 'PAYMONGO_FAILED_URL', 'PAYMONGO_CANCEL_URL',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    // Only the selected SMS provider's credentials are required.
    ...(phoneProvider(env) === 'textbee' ? ['TEXTBEE_API_KEY'] : phoneProvider(env) === 'semaphore' ? ['SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME'] : []),
  ]) {
    if (!String(env[name] || '').trim() || /YOUR[-_]|placeholder|replace[-_]/i.test(env[name])) failures.push(`${name} missing or placeholder`);
  }
  check('Core security configuration invalid', () => validateCoreEnvironment({ ...env, NODE_ENV: 'production' }));
  check('Production URL or provider mode mismatch', () => validateDeploymentUrls({ ...env, NODE_ENV: 'production' }));
  check('Database URL, SSL or pool configuration invalid', () => {
    const db = databaseConfig.createDatabaseConfig({ env: { ...env, NODE_ENV: 'production' } });
    if (!db.ssl) throw new Error();
  });
  check('Phone verification provider or OTP limits invalid', () => { if (!phoneOtpConfig(env).available) throw new Error(); });
  if (env.BACKUP_ENABLED && !['true', 'false'].includes(env.BACKUP_ENABLED)) failures.push('BACKUP_ENABLED must be true or false');
  if (env.BACKUP_ENABLED === 'true') {
    check('Backup schedule or retention invalid', () => backupConfig(env));
    check('BACKUP_ENCRYPTION_KEY missing or invalid', () => encryptionKey(env));
    check('Private backup storage configuration missing or invalid', () => {
      const url = new URL(env.SUPABASE_URL);
      if (url.protocol !== 'https:' || url.username || url.password
        || !String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
        || /YOUR[-_]|placeholder|replace[-_]/i.test(env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error();
    });
  }
  for (const [name, expected] of Object.entries({
    COOKIE_SAME_SITE: 'none', SESSION_STORE: 'postgres', PAYMENT_PROVIDER: 'paymongo',
    PAYMONGO_ALLOWED_METHODS: 'gcash', PAYMONGO_CURRENCY: 'PHP',
    SHIPPING_PROVIDER: 'internal', SHIPPING_FEE_PROVIDER: 'internal', COURIER_PROVIDER: 'jnt',
    WAYBILL_PROVIDER: 'manual', TRACKING_PROVIDER: 'manual',
  })) { if (env[name] !== expected) failures.push(`${name} must be ${expected}`); }
  failures.push(...inspectProductionEmailConfig(env).failures);
  return { ready: failures.length === 0, failures };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = process.argv.includes('--email-only')
    ? inspectProductionEmailConfig(process.env)
    : inspectProductionConfig(process.env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
