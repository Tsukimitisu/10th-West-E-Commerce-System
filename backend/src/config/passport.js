import './environment.cjs';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';

export const GOOGLE_OAUTH_SCOPES = Object.freeze(['openid', 'email', 'profile']);
export const GOOGLE_OAUTH_ENV_NAMES = Object.freeze({
  clientId: Object.freeze([
    'GOOGLE_CLIENT_ID',
    'GOOGLE_AUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_ID',
  ]),
  clientSecret: Object.freeze([
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_AUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_CLIENT_SECRET',
  ]),
  callbackUrl: Object.freeze([
    'GOOGLE_CALLBACK_URL',
    'GOOGLE_AUTH_CALLBACK_URL',
    'GOOGLE_OAUTH_CALLBACK_URL',
  ]),
});

const cleanEnvironmentValue = (value) => String(value || '').trim();

const isUsableCredential = (value) => {
  const credential = cleanEnvironmentValue(value);
  if (!credential) return false;
  return !/(?:^|[_-])(?:your|placeholder|example|change[_-]?me)(?:[_-]|$)|^<.*>$/i.test(credential);
};

const resolveEnvironmentAlias = (environment, names) => {
  for (const name of names) {
    const value = cleanEnvironmentValue(environment?.[name]);
    if (value) return { name, value };
  }
  return { name: null, value: '' };
};

const resolveDefaultGoogleCallbackUrl = (environment) => {
  const backendUrl = cleanEnvironmentValue(environment?.BACKEND_URL) || 'http://localhost:5000';
  try {
    return new URL('/api/auth/google/callback', backendUrl).toString();
  } catch {
    return 'http://localhost:5000/api/auth/google/callback';
  }
};

const resolveGoogleOAuthRuntimeConfiguration = (environment = process.env) => {
  const clientId = resolveEnvironmentAlias(environment, GOOGLE_OAUTH_ENV_NAMES.clientId);
  const clientSecret = resolveEnvironmentAlias(environment, GOOGLE_OAUTH_ENV_NAMES.clientSecret);
  const callback = resolveEnvironmentAlias(environment, GOOGLE_OAUTH_ENV_NAMES.callbackUrl);

  return {
    clientId: clientId.value,
    clientIdSource: clientId.name,
    clientSecret: clientSecret.value,
    clientSecretSource: clientSecret.name,
    callbackUrl: callback.value || resolveDefaultGoogleCallbackUrl(environment),
    callbackUrlSource: callback.name,
  };
};

const isValidGoogleCallbackUrl = (value, environment = process.env) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && (environment.NODE_ENV !== 'production' || url.protocol === 'https:')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname === '/api/auth/google/callback';
  } catch {
    return false;
  }
};

export const getGoogleOAuthConfigurationStatus = (environment = process.env) => {
  const configuration = resolveGoogleOAuthRuntimeConfiguration(environment);
  const clientIdValid = isUsableCredential(configuration.clientId);
  const clientSecretValid = isUsableCredential(configuration.clientSecret);
  const callbackUrlValid = isValidGoogleCallbackUrl(configuration.callbackUrl, environment);
  const configured = clientIdValid && clientSecretValid && callbackUrlValid;

  return {
    configured,
    clientIdPresent: Boolean(configuration.clientId),
    clientSecretPresent: Boolean(configuration.clientSecret),
    callbackUrlPresent: Boolean(configuration.callbackUrl),
    callbackUrl: configuration.callbackUrl,
    clientIdSource: configuration.clientIdSource,
    clientSecretSource: configuration.clientSecretSource,
    callbackUrlSource: configuration.callbackUrlSource,
    missing: [
      ...(!clientIdValid ? ['GOOGLE_CLIENT_ID'] : []),
      ...(!clientSecretValid ? ['GOOGLE_CLIENT_SECRET'] : []),
      ...(!callbackUrlValid ? ['GOOGLE_CALLBACK_URL'] : []),
    ],
  };
};

export const mapGoogleProfile = (profile = {}) => {
  const emailEntry = Array.isArray(profile.emails)
    ? profile.emails.find((entry) => cleanEnvironmentValue(entry?.value))
    : null;

  return {
    provider: 'google',
    providerUserId: cleanEnvironmentValue(profile.id || profile._json?.sub),
    email: cleanEnvironmentValue(emailEntry?.value || profile._json?.email).toLowerCase(),
    emailVerified: emailEntry?.verified === true || profile._json?.email_verified === true,
    firstName: cleanEnvironmentValue(profile.name?.givenName || profile._json?.given_name),
    lastName: cleanEnvironmentValue(profile.name?.familyName || profile._json?.family_name),
    displayName: cleanEnvironmentValue(profile.displayName || profile._json?.name),
    profileImageUrl: cleanEnvironmentValue(profile.photos?.[0]?.value || profile._json?.picture),
  };
};

const googleRuntimeConfiguration = resolveGoogleOAuthRuntimeConfiguration();
const googleConfiguration = getGoogleOAuthConfigurationStatus();

if (googleConfiguration.configured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleRuntimeConfiguration.clientId,
        clientSecret: googleRuntimeConfiguration.clientSecret,
        callbackURL: googleConfiguration.callbackUrl,
        scope: GOOGLE_OAUTH_SCOPES,
        state: true,
      },
      (_accessToken, _refreshToken, profile, done) => {
        try {
          done(null, mapGoogleProfile(profile));
        } catch (error) {
          done(error);
        }
      }
    )
  );
  console.log('   Google OAuth configuration:', {
    available: true,
    client_id_present: googleConfiguration.clientIdPresent,
    client_secret_present: googleConfiguration.clientSecretPresent,
    callback_url_present: googleConfiguration.callbackUrlPresent,
    callback_url: googleConfiguration.callbackUrl,
  });
} else {
  console.log('   Google OAuth configuration:', {
    available: false,
    client_id_present: googleConfiguration.clientIdPresent,
    client_secret_present: googleConfiguration.clientSecretPresent,
    callback_url_present: googleConfiguration.callbackUrlPresent,
    callback_url: googleConfiguration.callbackUrl,
  });
}

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/facebook/callback`,
        profileFields: ['id', 'emails', 'name', 'displayName', 'photos'],
      },
      (_accessToken, _refreshToken, profile, done) => {
        done(null, {
          provider: 'facebook',
          id: profile.id,
          providerUserId: profile.id,
          email: profile.emails?.[0]?.value,
          emailVerified: false,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          name: profile.displayName,
          displayName: profile.displayName,
          avatar: profile.photos?.[0]?.value,
          profileImageUrl: profile.photos?.[0]?.value,
        });
      }
    )
  );
  console.log('   Facebook OAuth configured');
} else {
  console.log('   Facebook OAuth not configured');
}

// Passport sessions remain disabled on OAuth routes. Authentication is bound
// to the application's existing Express session after provider verification.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

export default passport;
