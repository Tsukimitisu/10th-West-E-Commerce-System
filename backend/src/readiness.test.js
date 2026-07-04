import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public readiness is minimal and optional integrations do not block startup', async () => {
  const source = await readFile(new URL('./server.js', import.meta.url), 'utf8');
  const publicReady = source.slice(source.indexOf("app.get('/api/ready'"), source.indexOf('// CSRF token endpoint'));
  assert.match(publicReady, /core_ready/);
  assert.match(publicReady, /integrations_ready/);
  assert.doesNotMatch(publicReady, /shipping_provider:|tracking_provider:|shipping_carrier:/);
  const required = source.slice(source.indexOf('const requiredEnvVars'), source.indexOf('const optionalUploadVars'));
  assert.doesNotMatch(required, /PAYMONGO_SECRET_KEY|CLOUDINARY_API_SECRET|EMAIL_PASSWORD/);
});
