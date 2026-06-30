import { mockBlocked } from '../providerError.js';
import { configuration } from './providerUtils.js';

const PROVIDER = 'mock';
const assertDevelopment = () => {
  if (process.env.NODE_ENV === 'production') throw mockBlocked(PROVIDER);
};
const orderToken = (payload) => String(payload?.order?.id || payload?.orderId || 'UNKNOWN');

export const getConfigurationStatus = () => configuration(PROVIDER, [], { implemented: true, mock: true });
export const validateConfig = getConfigurationStatus;

export const calculateRates = async () => {
  assertDevelopment();
  return [{
    serviceCode: 'mock_standard',
    serviceName: 'Simulated standard delivery',
    amount: Number(process.env.MOCK_SHIPPING_RATE || 150),
    currency: 'PHP',
    estimatedDays: { min: 3, max: 5 },
    simulated: true,
  }];
};

export const createShipment = async (payload) => {
  assertDevelopment();
  const token = orderToken(payload);
  return {
    success: true,
    provider: PROVIDER,
    providerShipmentId: `MOCK-SHIP-${token}`,
    shipment_id: `MOCK-SHIP-${token}`,
    trackingNumber: `MOCK-TRACK-${token}`,
    tracking_number: `MOCK-TRACK-${token}`,
    providerStatus: 'booked',
    normalizedStatus: 'booked',
    status: 'booked',
    metadata: { simulated: true },
    simulated: true,
  };
};

export const getShipment = async ({ trackingNumber, providerShipmentId }) => {
  assertDevelopment();
  return {
    success: true,
    provider: PROVIDER,
    providerTrackingId: providerShipmentId || trackingNumber,
    trackingNumber,
    tracking_number: trackingNumber,
    providerStatus: 'in_transit',
    normalizedStatus: 'in_transit',
    status: 'in_transit',
    events: [{
      eventId: `MOCK-EVENT-${trackingNumber || providerShipmentId}`,
      status: 'in_transit',
      location: 'Development environment',
      description: 'Simulated tracking event',
      occurredAt: new Date().toISOString(),
      occurred_at: new Date().toISOString(),
      simulated: true,
    }],
    simulated: true,
  };
};

export const cancelShipment = async ({ providerShipmentId }) => {
  assertDevelopment();
  return {
    success: true,
    provider: PROVIDER,
    providerShipmentId,
    providerStatus: 'cancelled',
    normalizedStatus: 'cancelled',
    status: 'cancelled',
    simulated: true,
  };
};

export const generateWaybill = async (payload) => {
  assertDevelopment();
  const token = orderToken(payload);
  return {
    success: true,
    provider: PROVIDER,
    waybillNumber: `MOCK-WB-${token}`,
    waybill_number: `MOCK-WB-${token}`,
    labelUrl: null,
    label_url: null,
    status: 'generated',
    labelPayload: {
      simulated: true,
      warning: 'Development-only simulated label. Not valid for shipment.',
      order_id: payload?.order?.id || payload?.orderId,
      tracking_number: payload?.shipment?.tracking_number || `MOCK-TRACK-${token}`,
    },
    simulated: true,
  };
};

export const getWaybill = async (payload) => generateWaybill(payload);

export const handleWebhook = async () => {
  assertDevelopment();
  return { accepted: true, events: [], simulated: true };
};

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
