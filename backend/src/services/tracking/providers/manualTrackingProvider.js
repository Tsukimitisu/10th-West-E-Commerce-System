const PROVIDER = 'manual';

export const getConfigurationStatus = () => ({
  provider: PROVIDER,
  configured: true,
  implemented: true,
  ready: true,
  mock: false,
  missing: [],
  markets: ['PH'],
  carriers: ['jnt'],
  status: 'manual_tracking_number_only',
});

export const validateConfig = getConfigurationStatus;

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
};
