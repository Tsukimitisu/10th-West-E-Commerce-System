const PROVIDER = 'internal';

const selected = (name, fallback) => String(process.env[name] || fallback).trim().toLowerCase();

export const getConfigurationStatus = () => {
  const feeProvider = selected('SHIPPING_FEE_PROVIDER', PROVIDER);
  const coverage = selected('SHIPPING_COVERAGE', 'luzon_only');
  const distanceProvider = selected('DISTANCE_PROVIDER', PROVIDER);
  const configured = feeProvider === PROVIDER
    && coverage === 'luzon_only'
    && distanceProvider === PROVIDER;

  return {
    provider: PROVIDER,
    type: 'luzon_location_weight_distance_based',
    coverage,
    distance_provider: distanceProvider,
    configured,
    implemented: true,
    ready: configured,
    mock: false,
    missing: [],
    markets: ['PH-LUZON'],
    carriers: ['jnt'],
    status: configured ? 'configured' : 'invalid_configuration',
  };
};

export const validateConfig = getConfigurationStatus;

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
};
