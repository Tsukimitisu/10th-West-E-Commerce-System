import { getTrackingProvider } from './providers/index.js';

const invoke = (operation, payload) => {
  const provider = getTrackingProvider();
  return provider[operation](payload);
};

export const registerTracking = (payload) => invoke('registerTracking', payload);
export const registerTrackingNumber = (payload) => invoke('registerTrackingNumber', payload);
export const getTrackingStatus = (payload) => invoke('getTrackingStatus', payload);
export const listTrackingEvents = (payload) => invoke('listTrackingEvents', payload);
export const handleTrackingWebhook = (payload) => invoke('handleWebhook', payload);
