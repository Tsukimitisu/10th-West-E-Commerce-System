import crypto from 'crypto';
import { notConfigured, ProviderError, upstreamFailure } from '../../shipping/providerError.js';
import { configuration, envValue, normalizeStatus, safeJson } from '../../shipping/providers/providerUtils.js';

const PROVIDER = 'aftership';
const REQUIRED = ['AFTERSHIP_API_KEY', 'AFTERSHIP_WEBHOOK_SECRET'];
const DEFAULT_BASE_URL = 'https://api.aftership.com/tracking/2026-01';

export const getConfigurationStatus = () => configuration(PROVIDER, REQUIRED, { implemented: true });
export const validateConfig = getConfigurationStatus;

const assertConfigured = () => {
  const status = getConfigurationStatus();
  if (!status.configured) throw notConfigured(PROVIDER, status.missing);
};

const request = async (path, options = {}) => {
  assertConfigured();
  const response = await fetch(`${envValue('AFTERSHIP_API_BASE_URL') || DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'as-api-key': envValue('AFTERSHIP_API_KEY'),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(Number(process.env.TRACKING_PROVIDER_TIMEOUT_MS || 10000)),
  });
  const body = await safeJson(response);
  if (!response.ok) {
    const error = upstreamFailure(PROVIDER, 'request', response.status >= 500 ? 502 : 422);
    error.upstreamStatus = response.status;
    error.detail = body?.meta?.message || body?.message || null;
    throw error;
  }
  return body?.data || body;
};

const trackingRecord = (data) => data?.tracking || data;

const normalizeTracking = (data) => {
  const tracking = trackingRecord(data) || {};
  const checkpoints = Array.isArray(tracking.checkpoints) ? tracking.checkpoints : [];
  return {
    success: true,
    provider: PROVIDER,
    providerTrackingId: tracking.id || null,
    trackingNumber: tracking.tracking_number || null,
    tracking_number: tracking.tracking_number || null,
    providerStatus: tracking.tag || tracking.subtag || null,
    normalizedStatus: normalizeStatus(tracking.tag || tracking.subtag),
    status: normalizeStatus(tracking.tag || tracking.subtag),
    events: checkpoints.map((checkpoint, index) => ({
      eventId: checkpoint.id || `${tracking.id || tracking.tracking_number}-${checkpoint.checkpoint_time || index}`,
      status: normalizeStatus(checkpoint.tag || checkpoint.subtag),
      location: checkpoint.location || checkpoint.city || checkpoint.country_name || null,
      description: checkpoint.message || checkpoint.subtag_message || null,
      occurredAt: checkpoint.checkpoint_time || checkpoint.created_at || new Date().toISOString(),
      occurred_at: checkpoint.checkpoint_time || checkpoint.created_at || new Date().toISOString(),
      raw_status: checkpoint.tag || checkpoint.subtag || null,
    })),
  };
};

export const registerTracking = async ({ trackingNumber, courierSlug, orderId }) => {
  const data = await request('/trackings', {
    method: 'POST',
    body: JSON.stringify({
      tracking: {
        tracking_number: trackingNumber,
        ...(courierSlug ? { slug: courierSlug } : {}),
        ...(orderId ? { order_number: String(orderId), title: `Order ${orderId}` } : {}),
      },
    }),
  });
  return normalizeTracking(data);
};
export const registerTrackingNumber = registerTracking;

export const getTrackingStatus = async ({ providerTrackingId }) => {
  if (!providerTrackingId) {
    throw new ProviderError('AfterShip tracking registration is required before refresh.', {
      code: 'TRACKING_REGISTRATION_REQUIRED',
      status: 409,
      provider: PROVIDER,
    });
  }
  return normalizeTracking(await request(`/trackings/${encodeURIComponent(providerTrackingId)}`));
};
export const listTrackingEvents = async (payload) => (await getTrackingStatus(payload)).events;

const verifySignature = ({ rawBody, headers }) => {
  const secret = envValue('AFTERSHIP_WEBHOOK_SECRET');
  const signature = String(headers?.['aftership-hmac-sha256'] || '').trim();
  if (!secret || !signature || !rawBody) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const handleWebhook = async ({ rawBody, body, headers }) => {
  assertConfigured();
  if (!verifySignature({ rawBody, headers })) {
    throw new ProviderError('Invalid tracking webhook signature.', {
      code: 'INVALID_WEBHOOK_SIGNATURE',
      status: 401,
      provider: PROVIDER,
    });
  }
  const normalized = normalizeTracking(body?.msg || body?.data || body);
  return {
    accepted: true,
    events: normalized.events,
    tracking: normalized,
  };
};

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
