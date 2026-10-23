import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  linkOrCreateOAuthUser,
  normalizeOAuthIdentity,
} from './oauthAccounts.js';
import { requiredCoreRelations } from './coreReadiness.js';

const googleIdentity = (overrides = {}) => ({
  provider: 'google',
  providerUserId: 'google-sub-123',
  email: 'rider@gmail.com',
  emailVerified: true,
  firstName: 'Rider',
  lastName: 'One',
  displayName: 'Rider One',
  profileImageUrl: 'https://lh3.googleusercontent.com/rider',
  ...overrides,
});

const facebookIdentity = (overrides = {}) => ({
  provider: 'facebook',
  providerUserId: 'facebook-user-123',
  email: 'rider@gmail.com',
  emailVerified: true,
  firstName: 'Rider',
  lastName: 'One',
  displayName: 'Rider One',
  profileImageUrl: 'https://platform-lookaside.fbsbx.com/rider.jpg',
  ...overrides,
});

class MemoryOAuthDatabase {
  constructor({ users = [], identities = [] } = {}) {
    this.users = users.map((user) => ({
      role: 'customer',
      is_active: true,
      is_deleted: false,
      email_verified: true,
      avatar: null,
      password_hash: null,
      ...user,
    }));
    this.identities = identities.map((identity) => ({ ...identity }));
    this.queries = [];
    this.nextUserId = Math.max(0, ...this.users.map((user) => Number(user.id))) + 1;
  }

  async query(sql, params = []) {
    const source = String(sql);
    this.queries.push({ sql: source, params });

    if (source.includes('pg_advisory_xact_lock')) return { rows: [] };

    if (source.includes('FROM user_oauth_accounts oauth')) {
      const identity = this.identities.find((row) => (
        row.provider === params[0] && row.provider_user_id === params[1]
      ));
      const user = identity && this.users.find((row) => row.id === identity.user_id);
      return { rows: user ? [{ ...user }] : [] };
    }

    if (source.includes('UPDATE user_oauth_accounts')) {
      const identity = this.identities.find((row) => (
        row.provider === params[0] && row.provider_user_id === params[1]
      ));
      if (identity) {
        identity.provider_email = params[2];
        identity.profile_image_url = params[3] || identity.profile_image_url;
      }
      return { rows: [], rowCount: identity ? 1 : 0 };
    }

    if (source.includes('WHERE LOWER(email) = $1')) {
      return {
        rows: this.users
          .filter((user) => String(user.email).toLowerCase() === params[0])
          .sort((left, right) => left.id - right.id)
          .slice(0, 2)
          .map((user) => ({ ...user })),
      };
    }

    if (source.includes('INSERT INTO users')) {
      const user = {
        id: this.nextUserId++,
        name: params[0],
        email: params[1],
        password_hash: null,
        role: 'customer',
        avatar: params[2],
        oauth_provider: params[3],
        oauth_id: params[4],
        email_verified: true,
        is_active: true,
        is_deleted: false,
      };
      this.users.push(user);
      return { rows: [{ ...user }], rowCount: 1 };
    }

    if (source.includes('INSERT INTO user_oauth_accounts')) {
      const duplicate = this.identities.some((row) => (
        (row.provider === params[1] && row.provider_user_id === params[2])
        || (row.user_id === params[0] && row.provider === params[1])
      ));
      if (duplicate) throw Object.assign(new Error('duplicate identity'), { code: '23505' });
      this.identities.push({
        user_id: params[0],
        provider: params[1],
        provider_user_id: params[2],
        provider_email: params[3],
        profile_image_url: params[4],
      });
      return { rows: [], rowCount: 1 };
    }

    if (source.includes('UPDATE users')) {
      const user = this.users.find((row) => row.id === params[0]);
      if (user) {
        user.email_verified = true;
        user.avatar ||= params[1];
        user.last_login = new Date();
      }
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    throw new Error(`Unexpected OAuth account query: ${source}`);
  }
}

test('existing Google provider ID logs into its linked customer', async () => {
  const database = new MemoryOAuthDatabase({
    users: [{ id: 7, name: 'Existing Rider', email: 'old-address@gmail.com' }],
    identities: [{ user_id: 7, provider: 'google', provider_user_id: 'google-sub-123' }],
  });

  const result = await linkOrCreateOAuthUser(database, googleIdentity());
  assert.equal(result.user.id, 7);
  assert.equal(result.created, false);
  assert.equal(result.linked, false);
  assert.equal(database.users.length, 1);
  assert.equal(database.identities.length, 1);
});

test('verified Google email links to the existing customer without replacing customer data', async () => {
  const database = new MemoryOAuthDatabase({
    users: [{
      id: 8,
      name: 'Local Profile Name',
      email: 'rider@gmail.com',
      phone: '09171234567',
      avatar: 'https://cdn.example.test/existing-avatar.jpg',
      password_hash: 'preserved-local-password-hash',
      store_credit: '250.00',
      email_verified: false,
    }],
  });

  const result = await linkOrCreateOAuthUser(database, googleIdentity());
  assert.equal(result.user.id, 8);
  assert.equal(result.linked, true);
  assert.equal(database.users.length, 1);
  assert.equal(database.identities.length, 1);
  assert.equal(result.user.name, 'Local Profile Name');
  assert.equal(result.user.phone, '09171234567');
  assert.equal(result.user.password_hash, 'preserved-local-password-hash');
  assert.equal(result.user.store_credit, '250.00');
  assert.equal(result.user.avatar, 'https://cdn.example.test/existing-avatar.jpg');
  assert.equal(result.user.email_verified, true);
});

test('new verified Google identity creates one passwordless customer and one identity', async () => {
  const database = new MemoryOAuthDatabase();
  const result = await linkOrCreateOAuthUser(database, googleIdentity());

  assert.equal(result.created, true);
  assert.equal(result.user.role, 'customer');
  assert.equal(result.user.password_hash, null);
  assert.equal(result.user.email_verified, true);
  assert.equal(database.users.length, 1);
  assert.equal(database.identities.length, 1);
});

test('repeated Google login reuses the same user and identity', async () => {
  const database = new MemoryOAuthDatabase();
  const first = await linkOrCreateOAuthUser(database, googleIdentity());
  const second = await linkOrCreateOAuthUser(database, googleIdentity());

  assert.equal(second.user.id, first.user.id);
  assert.equal(database.users.length, 1);
  assert.equal(database.identities.length, 1);
});

test('Facebook login links an existing local or Google customer by provider-attested email', async () => {
  const database = new MemoryOAuthDatabase({
    users: [{ id: 12, email: 'rider@gmail.com', name: 'Preserved Rider', password_hash: 'preserved-hash' }],
    identities: [{ user_id: 12, provider: 'google', provider_user_id: 'google-existing' }],
  });

  const result = await linkOrCreateOAuthUser(database, facebookIdentity());
  assert.equal(result.user.id, 12);
  assert.equal(result.linked, true);
  assert.equal(database.users.length, 1);
  assert.equal(database.users[0].password_hash, 'preserved-hash');
  assert.equal(database.identities.length, 2);
});

test('repeated Facebook login creates one complete passwordless customer', async () => {
  const database = new MemoryOAuthDatabase();
  let createStartCount = 0;
  const lifecycle = { onCreateStart: () => { createStartCount += 1; } };
  const first = await linkOrCreateOAuthUser(database, facebookIdentity(), lifecycle);
  const second = await linkOrCreateOAuthUser(database, facebookIdentity(), lifecycle);

  assert.equal(first.created, true);
  assert.equal(first.user.role, 'customer');
  assert.equal(first.user.password_hash, null);
  assert.equal(second.user.id, first.user.id);
  assert.equal(database.users.length, 1);
  assert.equal(database.identities.length, 1);
  assert.equal(createStartCount, 1);
});

test('unverified Google email is rejected before any database lookup or linking', async () => {
  const database = new MemoryOAuthDatabase({
    users: [{ id: 9, email: 'rider@gmail.com', name: 'Local Rider' }],
  });

  await assert.rejects(
    () => linkOrCreateOAuthUser(database, googleIdentity({ emailVerified: false })),
    { code: 'OAUTH_EMAIL_UNVERIFIED' }
  );
  assert.equal(database.queries.length, 0);
  assert.equal(database.identities.length, 0);
});

test('customer Google login cannot auto-link to a privileged same-email account', async () => {
  const database = new MemoryOAuthDatabase({
    users: [{ id: 10, email: 'rider@gmail.com', name: 'Store Owner', role: 'owner' }],
  });

  await assert.rejects(
    () => linkOrCreateOAuthUser(database, googleIdentity()),
    { code: 'OAUTH_ACCOUNT_CONFLICT' }
  );
  assert.equal(database.identities.length, 0);
});

test('OAuth identity normalization stores no token and accepts only HTTPS profile images', () => {
  const identity = normalizeOAuthIdentity(googleIdentity({
    accessToken: 'must-not-be-stored',
    refreshToken: 'must-not-be-stored',
    profileImageUrl: 'javascript:alert(1)',
  }));

  assert.equal(identity.profileImageUrl, null);
  assert.equal('accessToken' in identity, false);
  assert.equal('refreshToken' in identity, false);
});

test('OAuth identity migration is backward compatible, unique, backfilled, and backend-only', async () => {
  const source = await readFile(
    new URL('../../migrations/202608300001_google_oauth_accounts.cjs', import.meta.url),
    'utf8'
  );

  assert.match(source, /user_oauth_accounts/);
  assert.match(source, /unique\(\['provider', 'provider_user_id'\]/);
  assert.match(source, /unique\(\['user_id', 'provider'\]/);
  assert.match(source, /FROM users[\s\S]*oauth_provider[\s\S]*oauth_id/);
  assert.match(source, /ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /REVOKE ALL ON TABLE user_oauth_accounts FROM anon/);
  assert.ok(requiredCoreRelations().includes('user_oauth_accounts'));
});
