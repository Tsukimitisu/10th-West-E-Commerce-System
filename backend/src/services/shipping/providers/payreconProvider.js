import { notConfigured, notImplemented } from '../providerError.js';
import { configuration } from './providerUtils.js';

const PROVIDER = 'payrecon';
// The provider contract is intentionally not guessed. Implement these operations
// only after PayRecon supplies approved API documentation and sandbox credentials.
const REQUIRED = [
  'PAYRECON_API_BASE_URL',
  'PAYRECON_API_KEY',
  'PAYRECON_API_SECRET',
  'PAYRECON_WEBHOOK_SECRET',
  'PAYRECON_ACCOUNT_ID',
  'SHIPPER_NAME',
  'SHIPPER_PHONE',
  'SHIPPER_ADDRESS_LINE1',
  'SHIPPER_CITY',
  'SHIPPER_POSTAL_CODE',
];

export const getConfigurationStatus = () => configuration(PROVIDER, REQUIRED);
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
