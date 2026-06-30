import { getShippingProvider } from './providers/index.js';

const invoke = (operation, payload) => {
  const provider = getShippingProvider();
  return provider[operation](payload);
};

export const calculateRates = (payload) => invoke('calculateRates', payload);
export const createShipment = (payload) => invoke('createShipment', payload);
export const getShipment = (payload) => invoke('getShipment', payload);
export const cancelShipment = (payload) => invoke('cancelShipment', payload);
export const generateWaybill = (payload) => invoke('generateWaybill', payload);
export const getWaybill = (payload) => invoke('getWaybill', payload);
export const handleShippingWebhook = (payload) => invoke('handleWebhook', payload);
