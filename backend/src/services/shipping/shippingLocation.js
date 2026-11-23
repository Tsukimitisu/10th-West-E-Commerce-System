export const SHIPPING_ZONES = Object.freeze({
  METRO_MANILA: 'metro_manila',
  LUZON: 'luzon',
  OUTSIDE_LUZON: 'outside_luzon',
  UNKNOWN_LUZON: 'unknown_luzon',
  UNKNOWN: 'unknown',
});

export const SHIPPING_ERRORS = Object.freeze({
  NOT_AVAILABLE: {
    code: 'SHIPPING_NOT_AVAILABLE',
    message: 'Shipping is currently available within Luzon only.',
  },
  ADDRESS_UNCLEAR: {
    code: 'SHIPPING_ADDRESS_UNCLEAR',
    message: 'Please update your shipping address with a valid Luzon city or province.',
  },
});

const METRO_MANILA_PLACES = Object.freeze([
  'metro manila', 'ncr', 'national capital region', 'manila', 'quezon city',
  'caloocan', 'las pinas', 'makati', 'malabon', 'mandaluyong', 'marikina',
  'muntinlupa', 'navotas', 'paranaque', 'pasay', 'pasig', 'san juan',
  'taguig', 'valenzuela', 'pateros',
]);

const LUZON_PLACES = Object.freeze([
  'bulacan', 'cavite', 'laguna', 'rizal', 'batangas', 'pampanga', 'tarlac',
  'nueva ecija', 'bataan', 'zambales', 'pangasinan', 'la union', 'ilocos norte',
  'ilocos sur', 'isabela', 'cagayan', 'nueva vizcaya', 'quirino', 'aurora',
  'quezon province', 'quezon', 'camarines norte', 'camarines sur', 'albay',
  'sorsogon', 'catanduanes', 'masbate', 'benguet', 'baguio', 'mountain province',
  'ifugao', 'kalinga', 'apayao', 'abra', 'occidental mindoro', 'oriental mindoro',
  'marinduque', 'romblon', 'palawan',
]);

const OUTSIDE_LUZON_PLACES = Object.freeze([
  'cebu', 'iloilo', 'bohol', 'leyte', 'samar', 'bacolod', 'davao',
  'cagayan de oro', 'general santos', 'zamboanga', 'butuan', 'surigao',
  'cotabato', 'bukidnon',
]);

const LUZON_REGION_ALIASES = Object.freeze([
  'luzon', 'ilocos region', 'region i', 'cagayan valley', 'region ii',
  'central luzon', 'region iii', 'calabarzon', 'region iv a', 'mimaropa',
  'region iv b', 'bicol region', 'region v', 'cordillera administrative region', 'car',
]);

const OUTSIDE_LUZON_REGION_ALIASES = Object.freeze([
  'visayas', 'mindanao', 'western visayas', 'central visayas', 'eastern visayas',
  'negros island region', 'zamboanga peninsula', 'northern mindanao',
  'davao region', 'soccsksargen', 'caraga', 'bangsamoro', 'barmm',
]);

export const normalizeShippingPlace = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const containsPlace = (value, place) => (
  value === place || ` ${value} `.includes(` ${place} `)
);

const hasMatch = (values, places) => values.some((value) => (
  places.some((place) => containsPlace(value, place))
));

const normalizedAddressParts = (address) => ({
  city: normalizeShippingPlace(address?.city),
  province: normalizeShippingPlace(address?.province || address?.state),
  region: normalizeShippingPlace(address?.region),
  full: normalizeShippingPlace(address?.address_string),
});

export const classifyPhilippineShippingZone = (address = {}) => {
  const parts = normalizedAddressParts(address);
  const values = Object.values(parts).filter(Boolean);
  if (values.length === 0) return SHIPPING_ZONES.UNKNOWN;

  // Check explicit Visayas/Mindanao places first so names such as Cagayan de Oro
  // cannot fall through to the Luzon province named Cagayan.
  if (hasMatch(values, OUTSIDE_LUZON_PLACES) || hasMatch(values, OUTSIDE_LUZON_REGION_ALIASES)) {
    return SHIPPING_ZONES.OUTSIDE_LUZON;
  }
  if (hasMatch(values, METRO_MANILA_PLACES)) return SHIPPING_ZONES.METRO_MANILA;
  if (hasMatch(values, LUZON_PLACES)) return SHIPPING_ZONES.LUZON;

  const regionValues = [parts.region, parts.province, parts.full].filter(Boolean);
  if (hasMatch(regionValues, LUZON_REGION_ALIASES)) return SHIPPING_ZONES.UNKNOWN_LUZON;
  return SHIPPING_ZONES.UNKNOWN;
};

export const assertLuzonShippingAvailable = (zone) => {
  if (zone === SHIPPING_ZONES.OUTSIDE_LUZON) {
    throw Object.assign(new Error(SHIPPING_ERRORS.NOT_AVAILABLE.message), {
      status: 422,
      code: SHIPPING_ERRORS.NOT_AVAILABLE.code,
    });
  }
  if (zone === SHIPPING_ZONES.UNKNOWN) {
    throw Object.assign(new Error(SHIPPING_ERRORS.ADDRESS_UNCLEAR.message), {
      status: 422,
      code: SHIPPING_ERRORS.ADDRESS_UNCLEAR.code,
    });
  }
  return zone;
};

export const LUZON_LOCATION_DATA = Object.freeze({
  metroManila: METRO_MANILA_PLACES,
  luzon: LUZON_PLACES,
  outsideLuzon: OUTSIDE_LUZON_PLACES,
});
