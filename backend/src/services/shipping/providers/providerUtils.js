export const envValue = (name) => {
  const value = String(process.env[name] || '').trim();
  return value || null;
};

export const configuration = (
  provider,
  requiredNames,
  {
    implemented = false,
    mock = false,
    markets = [],
    carriers = [],
  } = {}
) => {
  const missing = requiredNames.filter((name) => !envValue(name));
  const productionBlocked = mock && process.env.NODE_ENV === 'production';
  return {
    provider,
    configured: missing.length === 0 && !productionBlocked,
    implemented,
    mock,
    productionBlocked,
    missing,
    markets,
    carriers,
    ready: missing.length === 0 && implemented && !productionBlocked,
    status: productionBlocked
      ? 'blocked_in_production'
      : missing.length
        ? 'blocked_by_credentials'
        : implemented
          ? (mock ? 'development_mock' : 'configured')
          : 'not_implemented',
  };
};

export const normalizeStatus = (value, detail = '') => {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const statusDetail = String(detail || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const combined = `${status}_${statusDetail}`;
  if (
    /return(ed)?_to_(sender|origin)|return_to_(sender|origin)|exception_011/.test(combined)
    || ['returned', 'returning', 'return_to_sender', 'return_to_origin', 'rts'].includes(status)
  ) {
    return 'returned';
  }
  if (['cancelled', 'canceled', 'cancel'].includes(status)) return 'cancelled';
  const aliases = {
    info_received: 'pending',
    created: 'pending',
    booked: 'booked',
    pickup: 'picked_up',
    pickedup: 'picked_up',
    intransit: 'in_transit',
    outfordelivery: 'out_for_delivery',
    attempt_fail: 'failed_delivery',
    attemptfail: 'failed_delivery',
    exception: 'failed_delivery',
    available_for_pickup: 'ready_for_pickup',
    expired: 'unknown',
  };
  const normalized = aliases[status] || status;
  return [
    'pending',
    'booked',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed_delivery',
    'returned',
    'cancelled',
  ].includes(normalized) ? normalized : 'unknown';
};

export const safeJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
