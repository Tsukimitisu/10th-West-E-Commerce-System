import { getMissingCloudinaryVars, isCloudinaryConfigured } from './cloudinary.js';
import { toPublicProviderStatus } from './shipping/providers/providerUtils.js';

const present = (name) => {
  const value = String(process.env[name] || '').trim();
  return value.length > 0;
};

const firstPresent = (...names) => names.find((name) => present(name));

const providerStatus = ({ ready, selected = true, implemented = true }) => {
  if (!selected) return 'not_selected';
  if (!implemented) return 'implementation_needed';
  return ready ? 'configured' : 'blocked_by_credentials';
};

const publicStatus = (status) => (
  status === 'configured'
    ? 'configured'
    : status === 'not_selected'
      ? 'not_selected'
      : status === 'disabled'
        ? 'disabled'
        : 'blocked_by_credentials'
);

export const getEmailConfigurationStatus = () => {
  const hostName = firstPresent('SMTP_HOST', 'EMAIL_HOST');
  const portName = firstPresent('SMTP_PORT', 'EMAIL_PORT');
  const userName = firstPresent('SMTP_USER', 'EMAIL_USER');
  const passName = firstPresent('SMTP_PASS', 'EMAIL_PASSWORD');
  const provider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase()
    || (hostName ? 'smtp' : 'smtp');
  const selected = Boolean(provider || hostName || userName || passName);
  const missing = [];
  if (!hostName) missing.push('host');
  if (!portName) missing.push('port');
  if (!userName) missing.push('username');
  if (!passName) missing.push('password');

  return {
    provider,
    selected,
    ready: missing.length === 0,
    configured: missing.length === 0,
    status: providerStatus({ ready: missing.length === 0, selected }),
    missing_categories: missing,
    transport: {
      host: hostName ? process.env[hostName] : '',
      port: Number.parseInt(process.env[portName] || '587', 10),
      user: userName ? process.env[userName] : '',
      pass: passName ? process.env[passName] : '',
    },
  };
};

export const getMediaConfigurationStatus = () => {
  const missing = getMissingCloudinaryVars().map((name) => {
    if (name.includes('CLOUD_NAME')) return 'cloud_name';
    if (name.includes('API_KEY')) return 'api_key';
    return 'api_secret';
  });
  const ready = isCloudinaryConfigured();
  return {
    provider: 'cloudinary',
    selected: true,
    ready,
    configured: ready,
    status: providerStatus({ ready, selected: true }),
    missing_categories: missing,
  };
};

export const getOAuthConfigurationStatus = () => {
  const googleReady = present('GOOGLE_CLIENT_ID') && present('GOOGLE_CLIENT_SECRET');
  const facebookReady = present('FACEBOOK_APP_ID') && present('FACEBOOK_APP_SECRET');
  return {
    google: {
      provider: 'google',
      selected: true,
      ready: googleReady,
      status: providerStatus({ ready: googleReady, selected: true }),
      missing_categories: googleReady ? [] : ['client_id', 'client_secret'],
    },
    facebook: {
      provider: 'facebook',
      selected: true,
      ready: facebookReady,
      status: providerStatus({ ready: facebookReady, selected: true }),
      missing_categories: facebookReady ? [] : ['app_id', 'app_secret'],
    },
  };
};

export const getSupplementalProviderStatus = () => ({
  payrecon: {
    provider: 'payrecon',
    selected: false,
    ready: false,
    status: 'implementation_needed',
  },
  trackingmore: {
    provider: 'trackingmore',
    selected: String(process.env.TRACKING_PROVIDER || '').trim().toLowerCase() === 'trackingmore',
    ready: false,
    status: String(process.env.TRACKING_PROVIDER || '').trim().toLowerCase() === 'trackingmore'
      ? 'implementation_needed'
      : 'not_selected',
  },
});

export const buildPublicIntegrationReadiness = ({ paymongo, shipping, tracking }) => {
  const email = getEmailConfigurationStatus();
  const media = getMediaConfigurationStatus();
  return {
    payment: paymongo.configured ? 'configured' : 'blocked_by_credentials',
    shipping: toPublicProviderStatus(shipping),
    tracking: toPublicProviderStatus(tracking),
    email: publicStatus(email.status),
    media: publicStatus(media.status),
  };
};

export const buildAdminIntegrationReadiness = ({ paymongo, shipping, tracking }) => {
  const email = getEmailConfigurationStatus();
  const media = getMediaConfigurationStatus();
  const oauth = getOAuthConfigurationStatus();
  const supplemental = getSupplementalProviderStatus();
  return {
    paymongo: {
      provider: 'paymongo',
      ready: paymongo.configured,
      status: providerStatus({ ready: paymongo.configured, selected: true }),
      mode: paymongo.mode,
      missing_categories: paymongo.configured ? [] : ['public_key', 'secret_key', 'webhook_secret'],
    },
    shipping: {
      provider: shipping.provider,
      status: toPublicProviderStatus(shipping),
      ready: shipping.ready,
      implementation_needed: Boolean(shipping.implementationNeeded || shipping.status === 'not_implemented'),
      country: String(process.env.SHIPPING_COUNTRY || 'PH').toUpperCase(),
      carrier: String(process.env.SHIPPING_CARRIER || 'jtexpress-ph').toLowerCase(),
      coverage: 'selected_cities',
    },
    payrecon: supplemental.payrecon,
    tracking: {
      provider: tracking.provider,
      status: toPublicProviderStatus(tracking),
      ready: tracking.ready,
      carrier: String(process.env.SHIPPING_CARRIER || 'jtexpress-ph').toLowerCase(),
    },
    trackingmore: supplemental.trackingmore,
    email: {
      provider: email.provider,
      status: email.status,
      ready: email.ready,
      missing_categories: email.missing_categories,
    },
    oauth,
    media: {
      provider: media.provider,
      status: media.status,
      ready: media.ready,
      missing_categories: media.missing_categories,
    },
  };
};

export const selectedIntegrationsReady = (integrations) => (
  Object.values(integrations).every((item) => {
    if (!item || typeof item !== 'object') return item === 'configured' || item === 'not_selected' || item === 'disabled';
    if (item.selected === false) return true;
    if (item.status === 'not_selected' || item.status === 'disabled') return true;
    if ('ready' in item) return Boolean(item.ready);
    return true;
  })
);
