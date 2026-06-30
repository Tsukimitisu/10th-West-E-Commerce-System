import { notConfigured, notImplemented } from '../../shipping/providerError.js';
import { configuration } from '../../shipping/providers/providerUtils.js';

const PROVIDER = 'trackingmore';
const REQUIRED = ['TRACKINGMORE_API_KEY', 'TRACKINGMORE_WEBHOOK_SECRET'];

export const getConfigurationStatus = () => configuration(PROVIDER, REQUIRED, {
  markets: ['PH'],
  carriers: ['jtexpress-ph'],
});
export const validateConfig = getConfigurationStatus;

const unavailable = (operation) => {
  const status = getConfigurationStatus();
  if (!status.configured) throw notConfigured(PROVIDER, status.missing);
  throw notImplemented(PROVIDER, operation);
};

export const registerTracking = async () => unavailable('tracking registration');
export const registerTrackingNumber = registerTracking;
export const getTrackingStatus = async () => unavailable('tracking refresh');
export const listTrackingEvents = async () => unavailable('tracking event listing');
export const handleWebhook = async () => unavailable('webhook handling');

export default {
  name: PROVIDER,
  validateConfig,
  getConfigurationStatus,
  registerTracking,
  registerTrackingNumber,
  getTrackingStatus,
  listTrackingEvents,
  handleWebhook,
};
