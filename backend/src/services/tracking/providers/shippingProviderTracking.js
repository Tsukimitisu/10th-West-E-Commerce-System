import { getShippingConfigurationStatus, getShippingProvider } from '../../shipping/providers/index.js';

const PROVIDER = 'shipping_provider';

export const getConfigurationStatus = () => {
  const shipping = getShippingConfigurationStatus();
  return { ...shipping, provider: PROVIDER, delegatedProvider: shipping.provider };
};
export const validateConfig = getConfigurationStatus;

export const registerTracking = async ({ trackingNumber, providerShipmentId }) => ({
  provider: PROVIDER,
  providerTrackingId: providerShipmentId || trackingNumber,
  trackingNumber,
  providerStatus: 'registered',
  normalizedStatus: 'pending',
  events: [],
});
export const registerTrackingNumber = registerTracking;

export const getTrackingStatus = async (payload) => getShippingProvider().getShipment(payload);
export const listTrackingEvents = async (payload) => (await getTrackingStatus(payload)).events || [];
export const handleWebhook = async (payload) => getShippingProvider().handleWebhook(payload);

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
