import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/facebook_callback_test';
process.env.JWT_SECRET = 'facebook-oauth-callback-test-jwt-secret';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { default: pool } = await import('../config/database.js');
const { facebookOAuthCallback, getProfile } = await import('./authController.js');
const { getCart } = await import('./cartController.js');
const { authenticateToken } = await import('../middleware/auth.js');

afterEach(() => mock.restoreAll());
after(async () => pool.end().catch(() => {}));

const facebookIdentity = {
  provider: 'facebook',
  providerUserId: 'facebook-session-user',
  email: 'facebook.rider@example.com',
  emailVerified: true,
  firstName: 'Facebook',
  lastName: 'Rider',
  displayName: 'Facebook Rider',
  profileImageUrl: 'https://platform-lookaside.fbsbx.com/rider.jpg',
};

const makeSession = () => {
  const events = [];
  const session = {
    regenerate(callback) { events.push('regenerate'); callback(); },
    save(callback) { events.push('save'); callback(); },
  };
  return { session, events };
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  redirectUrl: '',
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  redirect(url) { this.redirectUrl = url; return this; },
});

test('Facebook callback creates a complete customer and saves the normal app session before redirect', async () => {
  const queryEvents = [];
  const customer = {
    id: 73,
    name: 'Facebook Rider',
    email: 'facebook.rider@example.com',
    password_hash: null,
    role: 'customer',
    avatar: facebookIdentity.profileImageUrl,
    email_verified: true,
    is_active: true,
    is_deleted: false,
  };
  const client = {
    async query(sql, params = []) {
      const source = String(sql);
      queryEvents.push(source.trim());
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(source.trim())) return { rows: [] };
      if (source.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (source.includes('FROM user_oauth_accounts oauth')) return { rows: [] };
      if (source.includes('WHERE LOWER(email) = $1')) return { rows: [] };
      if (source.includes('INSERT INTO users')) return { rows: [{ ...customer }], rowCount: 1 };
      if (source.includes('INSERT INTO user_oauth_accounts')) return { rows: [], rowCount: 1 };
      if (source.includes('UPDATE users')) return { rows: [{ ...customer, last_login: new Date() }], rowCount: 1 };
      if (source.includes('INSERT INTO sessions')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected Facebook callback query: ${source} ${params.length}`);
    },
    release() {},
  };

  mock.method(pool, 'connect', async () => client);
  mock.method(pool, 'query', async (sql) => {
    if (String(sql).includes('SELECT id') && String(sql).includes('FROM sessions')) return { rows: [{ id: 901 }] };
    if (String(sql).includes('SELECT id, name, email, role')) return { rows: [{ ...customer }] };
    if (String(sql).includes('FROM users WHERE id = $1')) return { rows: [{ ...customer }] };
    if (String(sql).includes('FROM carts') && String(sql).includes('WHERE user_id = $1')) return { rows: [] };
    if (String(sql).includes('INSERT INTO carts')) return { rows: [{ id: 812, user_id: customer.id }], rowCount: 1 };
    if (String(sql).includes('FROM cart_items')) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  mock.method(console, 'info', () => {});

  const { session, events } = makeSession();
  let passportLoginCompleted = false;
  const request = {
    oauthUser: facebookIdentity,
    clientIp: '127.0.0.1',
    clientUa: 'facebook-callback-test',
    headers: {},
    session,
    login(user, options, callback) {
      assert.equal(user.id, customer.id);
      assert.equal(options.session, false);
      passportLoginCompleted = true;
      callback();
    },
  };
  const response = makeResponse();

  await facebookOAuthCallback(request, response);

  assert.equal(passportLoginCompleted, true);
  assert.equal(request.session.auth.userId, customer.id);
  assert.equal(request.session.auth.role, 'customer');
  assert.equal(events.at(-1), 'save');
  assert.ok(queryEvents.includes('COMMIT'));
  assert.equal(response.redirectUrl, 'http://localhost:5173/#/oauth-callback?provider=facebook&status=success');
  assert.doesNotMatch(response.redirectUrl, /token|code=|email=/i);

  let authenticated = false;
  await authenticateToken(request, { status() { return this; }, json() {} }, () => { authenticated = true; });
  assert.equal(authenticated, true);
  assert.equal(request.user.id, customer.id);

  const profileResponse = makeResponse();
  await getProfile(request, profileResponse);
  assert.equal(profileResponse.statusCode, 200);
  assert.equal(profileResponse.body.id, customer.id);
  assert.equal(profileResponse.body.role, 'customer');
  assert.equal('password_hash' in profileResponse.body, false);

  const cartResponse = makeResponse();
  await getCart(request, cartResponse);
  assert.equal(cartResponse.statusCode, 200);
  assert.deepEqual(cartResponse.body, { cart_id: 812, items: [] });
});

test('Facebook callback rejects missing provider email with a safe frontend reason', async () => {
  const client = {
    async query(sql) {
      if (['BEGIN', 'ROLLBACK'].includes(String(sql).trim())) return { rows: [] };
      if (String(sql).includes('pg_advisory_xact_lock')) return { rows: [] };
      throw Object.assign(new Error('email required'), { code: 'OAUTH_EMAIL_REQUIRED' });
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  mock.method(console, 'error', () => {});
  mock.method(console, 'warn', () => {});

  const { session } = makeSession();
  const response = makeResponse();
  await facebookOAuthCallback({
    oauthUser: { ...facebookIdentity, email: '', emailVerified: false },
    clientIp: '127.0.0.1',
    clientUa: 'facebook-missing-email-test',
    headers: {},
    session,
  }, response);

  assert.match(response.redirectUrl, /error=oauth_missing_email&facebook=failed&reason=profile_missing_email$/);
  assert.doesNotMatch(response.redirectUrl, /facebook\.rider|secret|token/i);
});
