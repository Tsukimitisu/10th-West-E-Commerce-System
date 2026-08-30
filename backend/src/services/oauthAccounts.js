const SUPPORTED_PROVIDERS = new Set(['google', 'facebook']);
const EMAIL_PATTERN = /^(?=.{1,254}$)[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class OAuthAccountError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OAuthAccountError';
    this.code = code;
  }
}

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const cleanHttpsUrl = (value) => {
  const text = cleanText(value, 1000);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
};

export const normalizeOAuthIdentity = (identity = {}) => {
  const provider = cleanText(identity.provider, 50).toLowerCase();
  const providerUserId = cleanText(identity.providerUserId, 255);
  const email = cleanText(identity.email, 255).toLowerCase();
  const emailVerified = identity.emailVerified === true;
  const displayName = cleanText(identity.displayName, 255);
  const firstName = cleanText(identity.firstName, 120);
  const lastName = cleanText(identity.lastName, 120);
  const name = displayName || [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];

  if (!SUPPORTED_PROVIDERS.has(provider) || !providerUserId) {
    throw new OAuthAccountError('OAUTH_IDENTITY_INVALID', 'The OAuth identity is invalid.');
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new OAuthAccountError('OAUTH_EMAIL_REQUIRED', 'A valid email address is required.');
  }
  if (!emailVerified) {
    throw new OAuthAccountError('OAUTH_EMAIL_UNVERIFIED', 'The provider email address is not verified.');
  }

  return {
    provider,
    providerUserId,
    email,
    emailVerified,
    name: cleanText(name, 255),
    profileImageUrl: cleanHttpsUrl(identity.profileImageUrl),
  };
};

const assertCustomerAvailable = (user) => {
  if (!user || user.role !== 'customer') {
    throw new OAuthAccountError('OAUTH_ACCOUNT_CONFLICT', 'This account cannot be linked through customer login.');
  }
  if (!user.is_active || user.is_deleted) {
    throw new OAuthAccountError('OAUTH_ACCOUNT_DEACTIVATED', 'This account is unavailable.');
  }
};

const updateLinkedUser = async (database, userId, profileImageUrl) => {
  const result = await database.query(
    `UPDATE users
     SET email_verified = true,
         avatar = COALESCE(avatar, $2),
         last_login = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId, profileImageUrl]
  );
  return result.rows[0];
};

export const linkOrCreateOAuthUser = async (database, rawIdentity) => {
  const identity = normalizeOAuthIdentity(rawIdentity);
  const identityLock = `oauth:${identity.provider}:${identity.providerUserId}`;
  const emailLock = `oauth-email:${identity.email}`;

  await database.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identityLock]);
  await database.query('SELECT pg_advisory_xact_lock(hashtext($1))', [emailLock]);

  const linkedResult = await database.query(
    `SELECT users.*
     FROM user_oauth_accounts oauth
     JOIN users ON users.id = oauth.user_id
     WHERE oauth.provider = $1 AND oauth.provider_user_id = $2
     LIMIT 1
     FOR UPDATE OF oauth, users`,
    [identity.provider, identity.providerUserId]
  );

  if (linkedResult.rows.length > 0) {
    const linkedUser = linkedResult.rows[0];
    assertCustomerAvailable(linkedUser);
    await database.query(
      `UPDATE user_oauth_accounts
       SET provider_email = $3, profile_image_url = COALESCE($4, profile_image_url), updated_at = NOW()
       WHERE provider = $1 AND provider_user_id = $2`,
      [identity.provider, identity.providerUserId, identity.email, identity.profileImageUrl]
    );
    return {
      user: await updateLinkedUser(database, linkedUser.id, identity.profileImageUrl),
      created: false,
      linked: false,
    };
  }

  const emailResult = await database.query(
    `SELECT *
     FROM users
     WHERE LOWER(email) = $1
     ORDER BY id
     LIMIT 2
     FOR UPDATE`,
    [identity.email]
  );

  if (emailResult.rows.length > 1) {
    throw new OAuthAccountError('OAUTH_ACCOUNT_CONFLICT', 'Multiple accounts use this email address.');
  }

  let user = emailResult.rows[0] || null;
  let created = false;

  if (user) {
    assertCustomerAvailable(user);
  } else {
    const createdResult = await database.query(
      `INSERT INTO users (
         name, email, password_hash, role, avatar, oauth_provider, oauth_id,
         email_verified, is_active, is_deleted, last_login
       )
       VALUES ($1, $2, NULL, 'customer', $3, $4, $5, true, true, false, NOW())
       RETURNING *`,
      [identity.name, identity.email, identity.profileImageUrl, identity.provider, identity.providerUserId]
    );
    user = createdResult.rows[0];
    created = true;
  }

  try {
    await database.query(
      `INSERT INTO user_oauth_accounts (
         user_id, provider, provider_user_id, provider_email, profile_image_url
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, identity.provider, identity.providerUserId, identity.email, identity.profileImageUrl]
    );
  } catch (error) {
    if (error?.code === '23505') {
      throw new OAuthAccountError(
        'OAUTH_ACCOUNT_CONFLICT',
        'This provider identity is already linked to an account.'
      );
    }
    throw error;
  }

  return {
    user: await updateLinkedUser(database, user.id, identity.profileImageUrl),
    created,
    linked: !created,
  };
};
