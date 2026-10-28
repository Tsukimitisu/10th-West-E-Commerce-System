import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAllowedFrontendOrigins, resolveFrontendOrigin } from './frontend.js';

test('canonical frontend origin prefers FRONTEND_ORIGIN and falls back to FRONTEND_URL', () => {
  assert.equal(resolveFrontendOrigin({
    FRONTEND_ORIGIN: 'https://store.vercel.app',
    FRONTEND_URL: 'https://legacy.vercel.app',
  }), 'https://store.vercel.app');
  assert.equal(resolveFrontendOrigin({ FRONTEND_URL: 'https://legacy.vercel.app/' }), 'https://legacy.vercel.app');
});

test('credentialed CORS allow-list safely includes both frontend aliases and exact extras', () => {
  assert.deepEqual(resolveAllowedFrontendOrigins({
    FRONTEND_ORIGIN: 'https://store.vercel.app',
    FRONTEND_URL: 'https://admin.vercel.app/',
    CORS_ALLOWED_ORIGINS: 'https://preview.vercel.app, https://store.vercel.app',
  }), [
    'https://store.vercel.app',
    'https://admin.vercel.app',
    'https://preview.vercel.app',
  ]);
});
