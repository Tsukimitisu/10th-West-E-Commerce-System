import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePublicEnvironment } from '../api-url.js';

test('frontend builds reject private credentials without echoing their values', () => {
  for (const entry of [
    { VITE_RESEND_API_KEY: 're_private-marker' }, { VITE_SESSION_SECRET: 'private-marker' },
    { VITE_PUBLIC_KEY: 'sk_test_private-marker' },
    { VITE_PUBLIC_KEY: '  re_private-marker  ' },
    { VITE_TOKEN: `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'customer' }))}.signature` },
    { VITE_SUPABASE_KEY: `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' }))}.signature` },
  ]) assert.throws(() => validatePublicEnvironment(entry), error => /backend-only credential/.test(error.message) && !error.message.includes('private-marker'));
  assert.doesNotThrow(() => validatePublicEnvironment({ VITE_API_URL: 'https://api.example.test/api', VITE_PAYMONGO_PUBLIC_KEY: 'pk_test_public', VITE_SUPABASE_ANON_KEY: `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'anon' }))}.signature` }));
});

test('Vercel headers block framing and active object content while preserving scanner and address permissions', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['content-security-policy'], /object-src 'none'; base-uri 'self'; frame-ancestors 'none'/);
  assert.match(headers['permissions-policy'], /camera=\(self\)/);
  assert.match(headers['permissions-policy'], /geolocation=\(self\)/);
});
