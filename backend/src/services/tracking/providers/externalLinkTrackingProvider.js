const PROVIDER = 'external_link';

export const getConfigurationStatus = () => ({
  provider: PROVIDER,
  configured: true,
  implemented: true,
  ready: true,
  mock: false,
  missing: [],
  markets: ['PH'],
  carriers: ['jnt'],
  status: 'available_after_waybill',
});

export const validateConfig = getConfigurationStatus;

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
};
