import { notConfigured, notImplemented } from '../providerError.js';
import { configuration } from './providerUtils.js';

const PROVIDER = 'bigseller';
// BigSeller Open API access and its private contract must be approved before the
// shell below can safely make booking or fulfillment requests.
const REQUIRED = [
  'BIGSELLER_API_BASE_URL',
  'BIGSELLER_APP_KEY',
  'BIGSELLER_APP_SECRET',
  'BIGSELLER_ACCESS_TOKEN',
  'BIGSELLER_WEBHOOK_SECRET',
  'BIGSELLER_WAREHOUSE_ID',
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
