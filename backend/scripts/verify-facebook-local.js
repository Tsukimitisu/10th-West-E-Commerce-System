import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(backendRoot, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const backendUrl = String(process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const expectedCallback = 'http://localhost:5000/api/auth/facebook/callback';
const configuredCallback = String(process.env.FACEBOOK_CALLBACK_URL || '').trim();
const checks = [];

const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

const request = async (url) => fetch(url, { redirect: 'manual' });

check('Facebook App ID present', Boolean(String(process.env.FACEBOOK_APP_ID || '').trim()), 'presence only');
check('Facebook App Secret present', Boolean(String(process.env.FACEBOOK_APP_SECRET || '').trim()), 'presence only');
check('Facebook callback URL present', Boolean(configuredCallback), 'presence only');
check('SESSION_SECRET present', Boolean(String(process.env.SESSION_SECRET || '').trim()), 'presence only');
check('Facebook callback URL exact', configuredCallback === expectedCallback, configuredCallback || 'missing');

try {
  const providers = await request(`${backendUrl}/api/auth/providers`);
  const responseText = await providers.text();
  let payload = {};
  try { payload = JSON.parse(responseText); } catch {}
  check('Backend reachable', providers.status > 0, `HTTP ${providers.status}`);
  check('Facebook readiness', payload.facebook?.available === true, payload.facebook?.reason || 'available');
  check('Readiness callback URL', payload.facebook?.callback_url === expectedCallback, payload.facebook?.callback_url || 'missing');
  const secret = String(process.env.FACEBOOK_APP_SECRET || '').trim();
  check('Readiness exposes no secret', !secret || !responseText.includes(secret), 'secret value absent');
} catch (error) {
  check('Backend reachable', false, `Start the backend with npm run dev (${error.code || error.message})`);
}

try {
  const oauth = await request(`${backendUrl}/api/auth/facebook`);
  const location = oauth.headers.get('location') || '';
  const isFacebookRedirect = (() => {
    try {
      const host = new URL(location).hostname;
      return host === 'facebook.com' || host.endsWith('.facebook.com');
    } catch {
      return false;
    }
  })();
  check('Facebook auth start', oauth.status === 302 && isFacebookRedirect, `HTTP ${oauth.status}`);
} catch (error) {
  check('Facebook auth start', false, error.code || error.message);
}

const failed = checks.filter(({ ok }) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
process.exitCode = failed.length ? 1 : 0;
