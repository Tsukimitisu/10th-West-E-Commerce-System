import { defineConfig, devices } from '@playwright/test';
import { loadFixtureEnvironment } from './e2e/fixtureEnvironment.js';

loadFixtureEnvironment();

const localHost = 'localhost';
const configuredBaseURL = process.env.E2E_BASE_URL;
const parsePort = (name, value, fallback) => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer port.`);
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be between 1 and 65535.`);
  }
  return port;
};
const frontendPort = parsePort('E2E_FRONTEND_PORT', process.env.E2E_FRONTEND_PORT, 3000);
const backendPort = parsePort('E2E_BACKEND_PORT', process.env.E2E_BACKEND_PORT, 5000);
const parseHttpURL = (name, value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials, query parameters, or a fragment.`);
  }
  return url;
};

const base = parseHttpURL('E2E_BASE_URL', configuredBaseURL || `http://${localHost}:${frontendPort}`);
const api = parseHttpURL(
  'E2E_API_URL',
  process.env.E2E_API_URL || (configuredBaseURL ? new URL('/api', base).toString() : `http://${localHost}:${backendPort}/api`)
);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (loopbackHosts.has(base.hostname) || loopbackHosts.has(api.hostname)) {
  if (base.hostname !== localHost || api.hostname !== localHost) {
    throw new Error('Local E2E URLs must consistently use localhost for both the frontend and API.');
  }
}
if (!api.pathname.replace(/\/+$/, '').endsWith('/api')) {
  throw new Error('E2E_API_URL must end with /api.');
}

const baseURL = base.toString().replace(/\/$/, '');
const apiURL = api.toString().replace(/\/$/, '');
const startLocalServer = !configuredBaseURL && process.env.E2E_START_SERVER !== 'false';
const reuseExistingServer = String(process.env.E2E_REUSE_SERVER || '').trim().toLowerCase() === 'true';
process.env.E2E_API_URL = apiURL;

const backendEnvironment = { ...process.env };
const inheritedDatabaseKeys = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'TEST_DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
for (const key of inheritedDatabaseKeys) delete backendEnvironment[key];

backendEnvironment.NODE_ENV = process.env.E2E_NODE_ENV || 'development';
if (process.env.E2E_DATABASE_URL) backendEnvironment.DATABASE_URL = process.env.E2E_DATABASE_URL;
if (process.env.E2E_SUPABASE_URL) backendEnvironment.SUPABASE_URL = process.env.E2E_SUPABASE_URL;
if (process.env.E2E_SUPABASE_ANON_KEY) backendEnvironment.SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
if (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
  backendEnvironment.SUPABASE_SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
}
for (const key of Object.keys(backendEnvironment)) {
  if (/^E2E_.*(?:PASSWORD|TOTP|DATABASE_URL|SUPABASE_.*KEY)$/.test(key)) {
    delete backendEnvironment[key];
  }
}
delete backendEnvironment.TEST_FIXTURE_PASSWORD;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS || 1),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: startLocalServer
    ? [
        {
          command: 'npm --prefix ../backend run start:e2e',
          url: `${apiURL}/ready`,
          reuseExistingServer,
          timeout: 120_000,
          env: {
            ...backendEnvironment,
            PORT: api.port || (api.protocol === 'https:' ? '443' : '80'),
            FRONTEND_ORIGIN: base.origin,
            FRONTEND_URL: base.origin,
          },
        },
        {
          command: `npm run dev:frontend -- --host localhost --port ${base.port || (base.protocol === 'https:' ? 443 : 80)} --strictPort`,
          url: baseURL,
          reuseExistingServer,
          timeout: 120_000,
          env: {
            ...process.env,
            VITE_API_URL: apiURL,
          },
        },
      ]
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
