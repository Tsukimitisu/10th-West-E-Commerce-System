import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { body } from 'express-validator';
import { createCorsOptions } from '../config/cors.js';
import databaseConfig from '../config/databaseConfig.cjs';
import { validateCoreEnvironment } from '../config/productionConfig.js';
import { protectPrivateFiles } from './privateFiles.js';
import { validateCsrf } from './csrf.js';
import { validate } from './validator.js';
import { errorHandler } from './errorHandler.js';
import { activityLogger } from './activityLogger.js';
import { sanitizeHttpUrlOrPath, sanitizeRichText } from '../utils/inputSanitizer.js';

const trusted = 'https://10th-west-e-commerce-system.vercel.app';
const app = express();
// Execute the actual server header configuration without starting its workers
// or connecting to any database.
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
vm.runInNewContext(source.slice(source.indexOf('app.use(helmet({'), source.indexOf('// Reject insecure production')), { app, helmet, allowedOrigins: [trusted] });
app.use(cors(createCorsOptions([trusted], { NODE_ENV: 'production' })));
app.use(protectPrivateFiles);
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/mutate', (req, _res, next) => { req.session = { auth: { userId: 1 } }; req.sessionID = 'test-session'; next(); }, validateCsrf, (_req, res) => res.json({ ok: true }));
app.post('/validate', body('password').isLength({ min: 40 }), validate, (_req, res) => res.json({ ok: true }));
app.get('/failure', () => { throw new Error('SQL SELECT password_hash private-server-path'); });
app.use(errorHandler);
let server, base;
before(async () => { await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));

test('production CORS permits only trusted origins and preserves authenticated preflight', async () => {
  const ok = await fetch(`${base}/health`, { headers: { Origin: trusted } });
  assert.equal(ok.headers.get('access-control-allow-origin'), trusted);
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  for (const origin of ['https://evil.example', 'https://10th-west-e-commerce-system.vercel.app.evil.example', 'http://localhost:5173', 'null']) {
    const rejected = await fetch(`${base}/health`, { headers: { Origin: origin } });
    assert.equal(rejected.status, 403); assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  }
  const preflight = await fetch(`${base}/health`, { method: 'OPTIONS', headers: { Origin: trusted, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-csrf-token/);
});

test('actual backend configuration sends security headers and blocks private paths before static serving', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy').includes('frame-ancestors'));
  assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.ok(res.headers.get('referrer-policy'));
  assert.match(res.headers.get('permissions-policy'), /camera=\(\)/);
  assert.equal(res.headers.get('x-powered-by'), null);
  for (const path of ['/.env.production', '/.git/config', '/uploads/database.dump.enc', '/uploads/private.pem', '/uploads/credentials.json', '/uploads/active.html', '/src/server.js', '/uploads/%252eenv']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('arbitrary Bearer headers cannot bypass CSRF when cookie authentication is available', async () => {
  const res = await fetch(`${base}/mutate`, { method: 'POST', headers: { Authorization: 'Bearer invalid-token', Cookie: 'twm.sid=test-only' } });
  assert.equal(res.status, 403); assert.equal((await res.json()).code, 'CSRF_INVALID_TOKEN');
  let stateless = false;
  validateCsrf({ method: 'POST', path: '/orders', headers: { authorization: 'Bearer stateless-client-token' } }, {}, () => { stateless = true; });
  assert.equal(stateless, true, 'stateless API callers still authenticate downstream');
});

test('validation and error feedback never echo passwords, query tokens or internal SQL details', async () => {
  const validation = await fetch(`${base}/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'private-password' }) });
  assert.equal(validation.status, 400); assert.doesNotMatch(await validation.text(), /private-password/);
  const logs = [];
  const log = mock.method(console, 'error', (...args) => logs.push(args));
  try {
    const failed = await fetch(`${base}/failure?token=private-query-token`);
    assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /SQL|password_hash|server-path/);
    assert.doesNotMatch(JSON.stringify(logs), /private-query-token|password_hash|server-path/);
  } finally { log.mock.restore(); }
});

test('rich text and URL validation reject script, handler, redirect and credential payloads', () => {
  assert.doesNotMatch(sanitizeRichText('<p onclick="evil()">Safe<script>evil()</script><a href="javascript:evil()">link</a></p>'), /onclick|script|javascript:/);
  for (const url of ['//evil.example', '/\\evil.example', 'javascript:evil()', 'data:text/html,evil', 'https://user:password@evil.example']) assert.equal(sanitizeHttpUrlOrPath(url), null);
  assert.equal(sanitizeHttpUrlOrPath('/uploads/item.png'), '/uploads/item.png');
});

test('audit metadata honors Express trust proxy rather than raw forwarding headers', () => {
  const req = { ip: '192.0.2.1', headers: { 'x-forwarded-for': 'attacker-controlled', 'user-agent': 'x'.repeat(1000) } };
  activityLogger(req, {}, () => {});
  assert.equal(req.clientIp, '192.0.2.1'); assert.equal(req.clientUa.length, 512);
});


test('production refuses disabled database TLS and a global TLS verification bypass', () => {
  assert.throws(() => databaseConfig.createDatabaseConfig({ env: { NODE_ENV: 'production', DATABASE_URL: 'postgresql://unit:unit@db.example.test/app', DB_SSL_MODE: 'disable' } }), { code: 'DATABASE_SSL_REQUIRED' });
  assert.throws(() => validateCoreEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'present', NODE_TLS_REJECT_UNAUTHORIZED: '0' }), { code: 'PRODUCTION_TLS_DISABLED' });
});
