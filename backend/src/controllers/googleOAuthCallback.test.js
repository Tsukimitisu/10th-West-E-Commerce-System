import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/google_callback_test';
process.env.JWT_SECRET = 'google-oauth-callback-test-jwt-secret';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { default: pool } = await import('../config/database.js');
const { googleOAuthCallback, logout } = await import('./authController.js');
const { authenticateToken } = await import('../middleware/auth.js');

afterEach(() => mock.restoreAll());
after(async () => pool.end().catch(() => {}));

const customer = {
  id: 42,
  name: 'Existing Rider',
  email: 'rider@gmail.com',
  password_hash: 'existing-local-password-hash',
  role: 'customer',
  phone: '09171234567',
  avatar: null,
  store_credit: '100.00',
  is_active: true,
  is_deleted: false,
  two_factor_enabled: false,
  email_verified: true,
};

const oauthIdentity = {
  provider: 'google',
  providerUserId: 'google-sub-session-test',
  email: 'rider@gmail.com',
  emailVerified: true,
  firstName: 'Existing',
  lastName: 'Rider',
  displayName: 'Existing Rider',
  profileImageUrl: 'https://lh3.googleusercontent.com/session-test',
};

const makeClient = () => {
  const calls = [];
  let identityLinked = false;
  let sessionInserted = false;
  const client = {
    async query(sql, params = []) {
      const source = String(sql);
      calls.push({ sql: source, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(source.trim())) return { rows: [] };
      if (source.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (source.includes('FROM user_oauth_accounts oauth')) return { rows: [] };
      if (source.includes('WHERE LOWER(email) = $1')) return { rows: [{ ...customer }] };
      if (source.includes('INSERT INTO user_oauth_accounts')) {
        identityLinked = true;
        return { rows: [], rowCount: 1 };
      }
      if (source.includes('UPDATE users')) {
        return { rows: [{ ...customer, avatar: params[1], last_login: new Date() }], rowCount: 1 };
      }
      if (source.includes('INSERT INTO sessions')) {
        sessionInserted = true;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected Google callback query: ${source}`);
    },
    release() {},
  };
  return {
    client,
    calls,
    identityLinked: () => identityLinked,
    sessionInserted: () => sessionInserted,
  };
};

const makeSession = ({ failAuthenticatedSave = false } = {}) => {
  let saveCalls = 0;
  const session = {
    regenerate(callback) { callback(); },
    save(callback) {
      saveCalls += 1;
      callback(failAuthenticatedSave && saveCalls === 2 ? new Error('session store unavailable') : undefined);
    },
    destroy(callback) {
      delete session.auth;
      delete session.cartSessionId;
      callback();
    },
  };
  return session;
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  redirectUrl: '',
  clearedCookie: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  redirect(url) { this.redirectUrl = url; return this; },
  clearCookie(name, options) { this.clearedCookie = { name, options }; },
});

test('Google callback creates the normal cookie session; protected routes and logout use it', async () => {
  const fixture = makeClient();
  const session = makeSession();
  const runtimeQueries = [];
  mock.method(pool, 'connect', async () => fixture.client);
  mock.method(pool, 'query', async (sql, params = []) => {
    const source = String(sql);
    runtimeQueries.push({ sql: source, params });
    if (source.includes('SELECT id') && source.includes('FROM sessions')) return { rows: [{ id: 700 }] };
    if (source.includes('SELECT id, name, email, role')) return { rows: [{ ...customer }] };
    return { rows: [], rowCount: 1 };
  });

  const request = {
    oauthUser: oauthIdentity,
    clientIp: '127.0.0.1',
    clientUa: 'google-oauth-test',
    headers: {},
    session,
  };
  const response = makeResponse();

  await googleOAuthCallback(request, response);

  assert.equal(response.redirectUrl, 'http://localhost:5173/#/oauth-callback');
  assert.equal(fixture.identityLinked(), true);
  assert.equal(fixture.sessionInserted(), true);
  assert.equal(request.session.auth.userId, customer.id);
  assert.equal(request.session.auth.role, 'customer');
  assert.match(request.session.auth.tokenHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(response.redirectUrl, /code=|token=|access_token|refresh_token/i);
  assert.equal(response.body, null);

  let nextCalled = false;
  await authenticateToken(request, makeResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(request.user.id, customer.id);

  const logoutResponse = makeResponse();
  await logout(request, logoutResponse);
  assert.equal(logoutResponse.statusCode, 200);
  assert.equal(logoutResponse.body.message, 'Logged out successfully');
  assert.equal(logoutResponse.clearedCookie.name, 'twm.sid');
  assert.equal(request.session.auth, undefined);
  assert.ok(runtimeQueries.some(({ sql }) => sql.includes('UPDATE sessions SET is_active = false')));

  const protectedAfterLogout = makeResponse();
  let nextAfterLogout = false;
  await authenticateToken(request, protectedAfterLogout, () => { nextAfterLogout = true; });
  assert.equal(nextAfterLogout, false);
  assert.equal(protectedAfterLogout.statusCode, 401);
});

test('Google callback deactivates its database session when cookie session persistence fails', async () => {
  const fixture = makeClient();
  const deactivatedTokenHashes = [];
  mock.method(pool, 'connect', async () => fixture.client);
  mock.method(pool, 'query', async (sql, params = []) => {
    if (String(sql).includes('UPDATE sessions SET is_active = false')) {
      deactivatedTokenHashes.push(params[0]);
    }
    return { rows: [], rowCount: 1 };
  });
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});

  const request = {
    oauthUser: oauthIdentity,
    clientIp: '127.0.0.1',
    clientUa: 'google-session-failure-test',
    headers: {},
    session: makeSession({ failAuthenticatedSave: true }),
  };
  const response = makeResponse();

  await googleOAuthCallback(request, response);

  assert.match(response.redirectUrl, /#\/login\?error=oauth_session_failed&google=failed&reason=session_save_failed$/);
  assert.equal(deactivatedTokenHashes.length, 1);
  assert.match(deactivatedTokenHashes[0], /^[a-f0-9]{64}$/);
  assert.equal(request.session.auth, undefined);
});

test('Google callback maps unverified email and database errors to customer-safe redirects', async () => {
  const unverifiedFixture = makeClient();
  mock.method(pool, 'connect', async () => unverifiedFixture.client);
  mock.method(pool, 'query', async () => ({ rows: [] }));
  mock.method(console, 'error', () => {});

  const unverifiedResponse = makeResponse();
  await googleOAuthCallback({
    oauthUser: { ...oauthIdentity, emailVerified: false },
    clientIp: '127.0.0.1',
    clientUa: 'google-unverified-test',
    headers: {},
    session: makeSession(),
  }, unverifiedResponse);
  assert.match(unverifiedResponse.redirectUrl, /#\/login\?error=oauth_unverified_email&google=failed&reason=email_not_verified$/);

  mock.restoreAll();
  mock.method(pool, 'connect', async () => {
    throw Object.assign(new Error('postgresql://user:secret@database.invalid/private'), { code: 'ECONNREFUSED' });
  });
  mock.method(console, 'error', () => {});

  const databaseFailureResponse = makeResponse();
  await googleOAuthCallback({
    oauthUser: oauthIdentity,
    clientIp: '127.0.0.1',
    clientUa: 'google-database-failure-test',
    headers: {},
    session: makeSession(),
  }, databaseFailureResponse);
  assert.match(databaseFailureResponse.redirectUrl, /#\/login\?error=google_failed&google=failed&reason=callback_failed$/);
  assert.doesNotMatch(databaseFailureResponse.redirectUrl, /secret|postgresql/i);
});
