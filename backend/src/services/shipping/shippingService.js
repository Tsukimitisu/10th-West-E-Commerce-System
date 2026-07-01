import { getShippingProvider } from './providers/index.js';
import { notConfigured, notImplemented } from './providerError.js';

const invoke = (operation, payload) => {
  const provider = getShippingProvider();
  return provider[operation](payload);
};

export const assertShippingOperationAvailable = (operation) => {
  const provider = getShippingProvider();
  const status = provider.validateConfig();
  if (!status.configured) throw notConfigured(provider.name);
  if (!status.implemented) throw notImplemented(provider.name, operation);
  return provider;
};

export const calculateRates = (payload) => invoke('calculateRates', payload);
export const createShipment = (payload) => invoke('createShipment', payload);
export const getShipment = (payload) => invoke('getShipment', payload);
export const cancelShipment = (payload) => invoke('cancelShipment', payload);
export const generateWaybill = (payload) => invoke('generateWaybill', payload);
export const getWaybill = (payload) => invoke('getWaybill', payload);
export const handleShippingWebhook = (payload) => invoke('handleWebhook', payload);
