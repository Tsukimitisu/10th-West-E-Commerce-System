import mockShippingProvider from '../../shipping/providers/mockShippingProvider.js';

export default {
  name: 'mock',
  validateConfig: mockShippingProvider.getConfigurationStatus,
  getConfigurationStatus: mockShippingProvider.getConfigurationStatus,
  registerTracking: async ({ trackingNumber, providerShipmentId }) => ({
    provider: 'mock',
    providerTrackingId: providerShipmentId || trackingNumber,
    trackingNumber,
    providerStatus: 'registered',
    normalizedStatus: 'pending',
    events: [],
    simulated: true,
  }),
  registerTrackingNumber: async ({ trackingNumber, providerShipmentId }) => ({
    provider: 'mock',
    providerTrackingId: providerShipmentId || trackingNumber,
    trackingNumber,
    providerStatus: 'registered',
    normalizedStatus: 'pending',
    events: [],
    simulated: true,
  }),
  getTrackingStatus: mockShippingProvider.getShipment,
  listTrackingEvents: async (payload) => (await mockShippingProvider.getShipment(payload)).events || [],
  handleWebhook: mockShippingProvider.handleWebhook,
};
