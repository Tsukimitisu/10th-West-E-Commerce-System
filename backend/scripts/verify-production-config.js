import '../src/config/environment.cjs';
import { validateCoreEnvironment } from '../src/config/productionConfig.js';
import { validateDeploymentUrls } from '../src/config/deployment.js';
import { phoneOtpConfig } from '../src/services/phoneOtp.js';
import databaseConfig from '../src/config/databaseConfig.cjs';
import { pathToFileURL } from 'node:url';

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
    'SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  ]) {
    if (!String(env[name] || '').trim() || /YOUR[-_]|placeholder|replace[-_]/i.test(env[name])) failures.push(`${name} missing or placeholder`);
  }
  check('Core security configuration invalid', () => validateCoreEnvironment({ ...env, NODE_ENV: 'production' }));
  check('Production URL or provider mode mismatch', () => validateDeploymentUrls({ ...env, NODE_ENV: 'production' }));
  check('Database URL, SSL or pool configuration invalid', () => {
    const db = databaseConfig.createDatabaseConfig({ env: { ...env, NODE_ENV: 'production' } });
    if (!db.ssl) throw new Error();
  });
  check('Semaphore configuration or OTP limits invalid', () => { if (!phoneOtpConfig(env).available) throw new Error(); });
  for (const [name, expected] of Object.entries({
    COOKIE_SAME_SITE: 'none', SESSION_STORE: 'postgres', PAYMENT_PROVIDER: 'paymongo',
    PAYMONGO_ALLOWED_METHODS: 'gcash', PAYMONGO_CURRENCY: 'PHP',
    SHIPPING_PROVIDER: 'internal', SHIPPING_FEE_PROVIDER: 'internal', COURIER_PROVIDER: 'jnt',
    WAYBILL_PROVIDER: 'manual', TRACKING_PROVIDER: 'manual',
  })) { if (env[name] !== expected) failures.push(`${name} must be ${expected}`); }
  if (!(env.SMTP_HOST || env.EMAIL_HOST) || !(env.SMTP_USER || env.EMAIL_USER)
    || !(env.SMTP_PASS || env.EMAIL_PASSWORD) || !env.EMAIL_FROM) failures.push('SMTP settings required for email account verification/reset');
  return { ready: failures.length === 0, failures };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = inspectProductionConfig(process.env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
