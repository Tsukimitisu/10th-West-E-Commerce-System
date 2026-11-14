import manualProvider from './manualTrackingProvider.js';
import externalLinkProvider from './externalLinkTrackingProvider.js';
import { ProviderError } from '../../shipping/providerError.js';

const PROVIDERS = {
  external_link: externalLinkProvider,
  manual: manualProvider,
};

export const getSelectedTrackingProviderName = () => String(
  process.env.TRACKING_PROVIDER || 'external_link'
).trim().toLowerCase();

export const getTrackingProvider = (name = getSelectedTrackingProviderName()) => {
  const provider = PROVIDERS[String(name || '').trim().toLowerCase()];
  if (!provider) {
    throw new ProviderError('Unsupported tracking provider.', {
      code: 'UNSUPPORTED_TRACKING_PROVIDER',
      status: 503,
      provider: name,
    });
  }
  return provider;
};

export const getTrackingConfigurationStatus = () => {
  const providerName = getSelectedTrackingProviderName();
  try {
    return getTrackingProvider(providerName).getConfigurationStatus();
  } catch {
    return {
      provider: providerName,
      configured: false,
      implemented: false,
      ready: false,
      mock: false,
      missing: [],
      status: 'unsupported_provider',
    };
  }
};
