import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(backendRoot, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const backendUrl = String(process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const frontendUrl = String(process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const expectedCallback = `${backendUrl}/api/auth/google/callback`;
const checks = [];

const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

const request = async (url, options = {}) => fetch(url, { redirect: 'manual', ...options });

check('frontend URL', frontendUrl === 'http://localhost:5173' || frontendUrl.startsWith('http'), frontendUrl);
check('backend URL', backendUrl === 'http://localhost:5000', backendUrl);
check('SESSION_SECRET present', Boolean(String(process.env.SESSION_SECRET || '').trim()), 'presence only');
check('Google callback URL', String(process.env.GOOGLE_CALLBACK_URL || expectedCallback) === expectedCallback, expectedCallback);

try {
  const providers = await request(`${backendUrl}/api/auth/providers`);
  const payload = await providers.json().catch(() => ({}));
  check('backend reachable', providers.status > 0, `HTTP ${providers.status}`);
  check('Google readiness', payload.google?.available === true, payload.google?.reason || 'available');
} catch (error) {
  check('backend reachable', false, error.code || error.message);
}

try {
  const oauth = await request(`${backendUrl}/api/auth/google`);
  const location = oauth.headers.get('location') || '';
  check('Google auth start', oauth.status === 302 && location.includes('accounts.google.com'), `HTTP ${oauth.status}`);
} catch (error) {
  check('Google auth start', false, error.code || error.message);
}

try {
  const profile = await request(`${backendUrl}/api/auth/profile/optional`);
  check('Unauthenticated profile behavior', profile.status === 204 || profile.status === 401, `HTTP ${profile.status}`);
} catch (error) {
  check('Unauthenticated profile behavior', false, error.code || error.message);
}

try {
  const cart = await request(`${backendUrl}/api/cart`);
  check('Unauthenticated cart behavior', cart.status !== 503, `HTTP ${cart.status}`);
} catch (error) {
  check('Unauthenticated cart behavior', false, error.code || error.message);
}

const failed = checks.filter(({ ok }) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
process.exitCode = failed.length ? 1 : 0;
