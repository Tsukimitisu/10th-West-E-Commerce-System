const PROVIDER = 'internal';

export const getConfigurationStatus = () => ({
  provider: PROVIDER,
  configured: true,
  implemented: true,
  ready: true,
  mock: false,
  missing: [],
  markets: ['PH'],
  carriers: ['jnt'],
  status: 'configured',
});

export const validateConfig = getConfigurationStatus;

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
};
