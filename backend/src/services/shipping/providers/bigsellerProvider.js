import { notConfigured, notImplemented } from '../providerError.js';
import { configuration, envValue } from './providerUtils.js';

const PROVIDER = 'bigseller';
// BigSeller Open API access and its private contract must be approved before the
// shell below can safely make booking or fulfillment requests. Do not implement
// requests by inferring portal behavior or copying undocumented endpoints.
export const BIGSELLER_CONTRACT_REQUIREMENTS = [
  'api_base_url',
  'app_key',
  'app_secret',
  'access_token',
  'warehouse_id',
  'jtexpress_ph_logistics_channel_code',
  'create_shipment_or_fulfillment_endpoint',
  'waybill_or_label_endpoint',
  'tracking_endpoint_if_supported',
  'webhook_signature_method',
];
const REQUIRED = [
  'BIGSELLER_API_BASE_URL',
  'BIGSELLER_APP_KEY',
  'BIGSELLER_APP_SECRET',
  'BIGSELLER_ACCESS_TOKEN',
  'BIGSELLER_WEBHOOK_SECRET',
  'BIGSELLER_WAREHOUSE_ID',
  'BIGSELLER_JT_PH_VIP_CODE',
  'SHIPPER_NAME',
  'SHIPPER_PHONE',
  'SHIPPER_ADDRESS_LINE1',
  'SHIPPER_CITY',
  'SHIPPER_POSTAL_CODE',
];

export const getConfigurationStatus = () => {
  const status = configuration(PROVIDER, REQUIRED, {
    markets: ['PH'],
    carriers: ['jtexpress-ph'],
  });
  const supportedRoute = (
    (envValue('SHIPPING_COUNTRY') || 'PH').toUpperCase() === 'PH'
    && (envValue('SHIPPING_CARRIER') || 'jtexpress-ph').toLowerCase() === 'jtexpress-ph'
  );
  return {
    ...status,
    configured: status.configured && supportedRoute,
    ready: status.ready && supportedRoute,
    supportedRoute,
    implementationNeeded: !status.implemented,
    contractRequirements: BIGSELLER_CONTRACT_REQUIREMENTS,
    status: supportedRoute ? status.status : 'unsupported_market_or_carrier',
  };
};
export const validateConfig = getConfigurationStatus;

const unavailable = (operation) => {
  const status = getConfigurationStatus();
  if (!status.configured) throw notConfigured(PROVIDER, status.missing);
  throw notImplemented(PROVIDER, operation);
};

export const calculateRates = async () => unavailable('rate calculation');
export const createShipment = async () => unavailable('shipment booking');
export const getShipment = async () => unavailable('shipment lookup');
export const cancelShipment = async () => unavailable('shipment cancellation');
export const generateWaybill = async () => unavailable('waybill generation');
export const getWaybill = async () => unavailable('waybill lookup');
export const handleWebhook = async () => unavailable('webhook handling');

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
  calculateRates,
  createShipment,
  getShipment,
  cancelShipment,
  generateWaybill,
  getWaybill,
  handleWebhook,
};
