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

test('production HTTPS enforcement does not reflect an untrusted host', async () => {
  const source = await readFile(new URL('./server.js', import.meta.url), 'utf8');
  const start = source.indexOf('// Reject insecure production requests');
  const end = source.indexOf("app.use(cors({", start);
  const middleware = source.slice(start, end);

  assert.match(middleware, /if \(!req\.secure\)/);
  assert.match(middleware, /status\(400\)/);
  assert.doesNotMatch(middleware, /req\.headers\.host|res\.redirect/);
});
