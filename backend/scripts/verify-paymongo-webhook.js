import '../src/config/environment.cjs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPaymongoConfigurationStatus } from '../src/services/paymongo.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const routesSource = await readFile(path.join(backendDirectory, 'src', 'routes', 'payments.js'), 'utf8');
const status = getPaymongoConfigurationStatus();
const webhookRoutePresent = /router\.post\(['"]\/paymongo\/webhook['"],\s*handlePaymongoWebhook\)/.test(routesSource);
const secretPresent = Boolean(String(process.env.PAYMONGO_SECRET_KEY || '').trim());
const webhookSecretPresent = Boolean(String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim());

console.log('PayMongo webhook local verification');
console.log(JSON.stringify({
  provider: status.provider,
  mode: status.mode,
  configured: status.configured,
  secret_key_present: secretPresent,
  webhook_secret_present: webhookSecretPresent,
  webhook_route_present: webhookRoutePresent,
}, null, 2));

if (!webhookRoutePresent || !secretPresent || !webhookSecretPresent) {
  console.error('PayMongo webhook verification is blocked by missing backend configuration or route registration.');
  process.exitCode = 1;
} else {
  const tests = spawnSync(
    process.execPath,
    ['--test', 'src/controllers/paymongoWebhook.test.js'],
    { cwd: backendDirectory, env: { ...process.env, NODE_ENV: 'test' }, stdio: 'inherit' }
  );
  if (tests.status !== 0) process.exitCode = tests.status || 1;
}
