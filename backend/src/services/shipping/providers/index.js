import bigsellerProvider from './bigsellerProvider.js';
import mockProvider from './mockShippingProvider.js';
import payreconProvider from './payreconProvider.js';
import { ProviderError } from '../providerError.js';

const PROVIDERS = {
  bigseller: bigsellerProvider,
  mock: mockProvider,
  payrecon: payreconProvider,
};

export const getSelectedShippingProviderName = () => String(
  process.env.SHIPPING_PROVIDER || 'payrecon'
).trim().toLowerCase();

export const getShippingProvider = (name = getSelectedShippingProviderName()) => {
  const provider = PROVIDERS[String(name || '').trim().toLowerCase()];
  if (!provider) {
    throw new ProviderError('Unsupported shipping provider.', {
      code: 'UNSUPPORTED_SHIPPING_PROVIDER',
      status: 503,
      provider: name,
    });
  }
  return provider;
};

export const getShippingConfigurationStatus = () => {
  const providerName = getSelectedShippingProviderName();
  try {
    return getShippingProvider(providerName).getConfigurationStatus();
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
